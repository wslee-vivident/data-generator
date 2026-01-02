import express from 'express';
import batchTranslate from './routes/aiTranslate'; 
import bodyParser from 'body-parser';
import driveCopyRouter from './routes/googleDriveImageCopy';

const app = express();

app.get("/", (req, res) => {
    res.send("Game Designer data generatr server is running.");   
});

app.use(bodyParser.json({ limit: '10mb' })); // 요청 본문 크기 제한 설정
app.use("/api", driveCopyRouter); //구글 드라이브 이미지 복사 경로 등록


app.use(express.json()); //JSON 파싱 미들웨어
app.use("/ai", batchTranslate); //ai 경로 등록


export default app;
const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, "0,0,0,0", () => {
  console.log(`Server is running on port ${PORT}`);
});