const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// 데이터베이스 연결 설정
const dbPromise = open({
    filename: 'database.db',
    driver: sqlite3.Database
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>하루, 한 줄</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
                button { padding: 10px 15px; margin: 10px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background-color: #45a049; }
            </style>
        </head>
        <body>
            <h1>하루, 한 줄</h1>
            <button onclick="location.href='/search-books'">새 책 읽기</button>
            <button onclick="location.href='/my-library'">내 책 보기</button>
        </body>
        </html>
    `);
});


app.get('/search-books', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>책 검색</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
                input, button { padding: 10px; margin: 10px; }
                button { background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background-color: #45a049; }
            </style>
        </head>
        <body>
            <h1>책 검색</h1>
            <form action="/search-books" method="post">
                <input type="text" name="query" placeholder="책 제목 또는 ISBN">
                <button type="submit">검색</button>
            </form>
            <button onclick="location.href='/'">메인 화면으로 돌아가기</button>
        </body>
        </html>
    `);
});


app.post('/search-books', async (req, res) => {
    const query = req.body.query;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURI(query)}`;

    try {
        const response = await axios.get(url);
        const books = response.data.items.map(book => {
            const authors = book.volumeInfo.authors ? book.volumeInfo.authors.join(', ') : '저자 정보 없음';
            return {
                id: book.id,
                title: book.volumeInfo.title,
                authors: authors,
                isbn: book.volumeInfo.industryIdentifiers?.find(identifier => identifier.type === 'ISBN_13')?.identifier || 'ISBN 정보 없음',
                pageCount: book.volumeInfo.pageCount
            };
        });

        res.send(`
        <html>
        <head>
            <title>검색 결과</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 20px; }
                ul { list-style-type: none; padding: 0; }
                li { margin: 10px 0; }
                button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background-color: #45a049; }
            </style>
        </head>
        <body>
            <h1>검색 결과</h1>
            <ul>
                ${books.map(book => `
                    <li>
                        <p>${book.title} - ${book.authors} - ISBN: ${book.isbn}</p>
                        <button onclick="location.href='/book-details/${book.id}'">책 살펴보기</button>
                    </li>
                `).join('')}
            </ul>
        </body>
        </html>
    `);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).send('검색 중 오류');
    }
});

app.get('/book-details/:id', async (req, res) => {
    const bookId = req.params.id;

    try {
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes/${bookId}`);
        const bookDetails = response.data.volumeInfo;

        res.send(`
            <html>
            <head>
                <title>${bookDetails.title || '제목 없음'}</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding-top: 20px; }
                    img { max-width: 200px; height: auto; margin-top: 20px; }
                    p { color: #555; }
                    button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                    button:hover { background-color: #45a049; }
                </style>
            </head>
            <body>
                <h1>${bookDetails.title || '제목 없음'}</h1>
                <img src="${bookDetails.imageLinks?.thumbnail || '이미지 없음'}" alt="표지 이미지">
                <p>저자: ${bookDetails.authors?.join(', ') || '저자 정보 없음'}</p>
                <p>ISBN: ${bookDetails.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || 'ISBN 정보 없음'}</p>
                <p>총 페이지: ${bookDetails.pageCount || '페이지 정보 없음'}</p>
                <button onclick="location.href='/add-book/${bookId}'">이 책 읽기</button>
                <p>설명: ${bookDetails.description || '설명 없음'}</p>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('책 상세 정보 로딩 오류:', error);
        res.status(500).send('책 상세 정보를 불러오는 중 오류');
    }
});

app.get('/add-book/:id', async (req, res) => {
    const bookId = req.params.id;

    try {
        // Google Books API에서 책 정보 가져오기
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes/${bookId}`);
        const bookDetails = response.data.volumeInfo;

        // 데이터베이스에 책 정보 저장
        const db = await dbPromise;
        await db.run(
            'INSERT INTO books (title, author, isbn, totalPages) VALUES (?, ?, ?, ?)',
            [bookDetails.title, bookDetails.authors.join(', '), bookDetails.industryIdentifiers.find(id => id.type === 'ISBN_13')?.identifier, bookDetails.pageCount]
        );

        res.send(`
            <html>
            <head>
                <title>책 추가 완료</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        background-color: #f0f0f0; 
                        padding: 40px; 
                    }
                    .main-button {
                        background-color: #4CAF50;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 16px;
                        text-decoration: none;
                    }
                    .main-button:hover {
                        background-color: #45a049;
                    }
                </style>
            </head>
            <body>
                <p>책이 서재에 추가되었습니다.</p>
                <button class="main-button" onclick="location.href='/'">메인 화면으로 돌아가기</button>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('책을 서재에 추가하는 중 오류:', error);
        res.status(500).send('책을 서재에 추가하는 중 오류');
    }
});


app.get('/reading/:id', async (req, res) => {
    const bookId = req.params.id;
    try {
        const db = await dbPromise;
        const book = await db.get("SELECT * FROM books WHERE id = ?", [bookId]);
        const progress = book.lastReadPage && book.totalPages ? Math.round((book.lastReadPage / book.totalPages) * 100) : 0;

        res.send(`
            <html>
            <head>
                <title>${book.title} - 독서 기록</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding-top: 20px; }
                    form { margin-top: 20px; }
                    input, textarea { padding: 8px; margin: 5px; width: 80%; max-width: 300px; }
                    button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                    button:hover { background-color: #45a049; }
                    label { display: block; margin-top: 10px; }
                </style>
            </head>
            <body>
                <h1>${book.title} - 독서 기록</h1>
                <p>현재 진행률: ${progress}% (${book.lastReadPage} / ${book.totalPages} 페이지)</p>
                <form action="/save-note" method="post">
                    <input type="hidden" name="bookId" value="${book.id}">
                    <label for="startPage">시작 페이지:</label>
                    <input type="number" name="startPage" id="startPage" value="${book.lastReadPage + 1}" min="1" max="${book.totalPages}" required>
                    <label for="endPage">끝 페이지:</label>
                    <input type="number" name="endPage" id="endPage" min="1" max="${book.totalPages}" required>
                    <label for="reflection">독후감:</label>
                    <textarea name="reflection" id="reflection" rows="10" required></textarea>
                    <button type="submit">저장</button>
                </form>
                <button onclick="location.href='/my-library'">내 서재로 돌아가기</button>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('책 정보를 불러오는 중 오류');
    }
});


app.get('/my-library', async (req, res) => {
    try {
        const db = await dbPromise;
        const books = await db.all("SELECT * FROM books");

        res.send(`
        <html>
        <head>
            <title>내 서재</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 20px; }
                .progress-container {
                    background-color: #eee;
                    border-radius: 13px;
                    width: 80%;
                    max-width: 300px;
                    margin: 10px auto;
                }
                .progress-bar {
                    background-color: #4CAF50;
                    width: 0%;
                    height: 20px;
                    border-radius: 13px;
                }
                ul { list-style-type: none; padding: 0; }
                li { margin: 10px 0; }
                button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background-color: #45a049; }
            </style>
        </head>
        <body>
            <h1>내 서재</h1>
            <ul>
                ${books.map(book => {
                    const progress = book.lastReadPage && book.totalPages ? Math.round((book.lastReadPage / book.totalPages) * 100) : 0;
                    return `
                        <li>
                            <div class="progress-container">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                            <p>${book.title} - ${book.author}</p>
                            <button onclick="location.href='/reading/${book.id}'">독서 기록</button>
                            ${book.read ? `<button onclick="location.href='/generate-review/${book.id}'">독후감 만들기</button>` : ''}
                            <button onclick="deleteBook(${book.id})">책 삭제</button>
                        </li>
                    `;
                }).join('')}
            </ul>
            <button onclick="location.href='/'">메인 화면으로 돌아가기</button>
            <script>
                function deleteBook(bookId) {
                    if (confirm("책을 삭제하시겠습니까?")) {
                        fetch('/delete-book/' + bookId, { method: 'DELETE' })
                            .then(response => {
                                if (response.ok) {
                                    alert("책이 삭제되었습니다.");
                                    location.reload();
                                } else {
                                    alert("삭제 중 오류가 발생했습니다.");
                                }
                            })
                            .catch(error => console.error('Error:', error));
                    }
                }
            </script>
        `);
    } catch (error) {
        res.status(500).send('서재 정보를 불러오는 중 오류');
    }
});

app.post('/save-note', async (req, res) => {
    const { bookId, startPage, endPage, reflection } = req.body;
    const currentDate = new Date().toISOString().split('T')[0];

    try {
        const db = await dbPromise;
        await db.run("INSERT INTO reading_logs (book_id, date, startPage, endPage, reflection) VALUES (?, ?, ?, ?, ?)", [bookId, currentDate, startPage, endPage, reflection]);
        await db.run("UPDATE books SET lastReadPage = ?, read = CASE WHEN lastReadPage >= totalPages THEN 1 ELSE 0 END WHERE id = ?", [endPage, bookId]);

        // lastReadPage와 totalPages를 불러옴
        const book = await db.get("SELECT lastReadPage, totalPages FROM books WHERE id = ?", bookId);

        // 책을 끝까지 읽었는지 확인
        const isCompleted = endPage >= book.totalPages;

        // lastReadPage와 read 상태를 업데이트
        await db.run("UPDATE books SET lastReadPage = ?, read = ? WHERE id = ?", [endPage, isCompleted, bookId]);


        res.send(`
            <p>독서 기록이 저장되었습니다.</p>
            <button onclick="location.href='/my-library'">내 서재로 돌아가기</button>
        `);

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send('독서 노트 저장 중 오류');
    }
});


app.get('/generate-review/:id', async (req, res) => {
    const bookId = req.params.id;
    try {
        const db = await dbPromise;
        const book = await db.get("SELECT title, MIN(date) as startDate, MAX(date) as endDate FROM books JOIN reading_logs ON books.id = reading_logs.book_id WHERE books.id = ?", [bookId]);
        const notes = await db.all("SELECT * FROM reading_logs WHERE book_id = ?", [bookId]);
        
        const bookReview = notes.map(note => note.reflection).join('\n\n');

        res.send(`
        <html>
        <head>
            <title>독후감</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 20px; }
                div { border: 1px solid #ddd; padding: 20px; margin-top: 20px; }
                button { padding: 10px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                button:hover { background-color: #45a049; }
            </style>
        </head>
        <body>
            <h1>${book.title} - 독후감</h1>
            <p>독서 기간: ${book.startDate}부터 ${book.endDate}까지</p>
            <div>
                <h2>완성된 독후감</h2>
                <p style="white-space: pre-wrap;">${bookReview}</p>
            </div>
            <button onclick="location.href='/my-library'">내 서재로 돌아가기</button>
        </body>
        </html>
    `);
    } catch (error) {
        res.status(500).send('독후감을 생성하는 중 오류');
    }
});

app.delete('/delete-book/:id', async (req, res) => {
    const bookId = req.params.id;

    try {
        const db = await dbPromise;

        // reading_logs 테이블에서 해당 책에 관한 기록 삭제
        await db.run("DELETE FROM reading_logs WHERE book_id = ?", [bookId]);

        // books 테이블에서 책 삭제
        await db.run("DELETE FROM books WHERE id = ?", [bookId]);

        res.status(200).send("책 관련 기록 삭제");
    } catch (error) {
        console.error('책 삭제 중 오류:', error);
        res.status(500).send("책 삭제 중 오류 발생");
    }
});


// 서버 실행
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});