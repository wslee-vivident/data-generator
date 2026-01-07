import express from 'express';
import batchTranslate from './routes/aiTranslate'; 
import storyGenerate from './routes/aiStoryGenerator';
import bodyParser from 'body-parser';
import driveCopyRouter from './routes/googleDriveImageCopy';

const app = express();

app.get("/", (req, res) => {
    res.send("Game Designer data generatr server is running.");   
});

app.use(bodyParser.json({ limit: '20mb' })); // 요청 본문 크기 제한 설정
app.use("/api", driveCopyRouter); //구글 드라이브 이미지 복사 경로 등록
app.use("/ai", batchTranslate); //ai 경로 등록
app.use("/ai-create", storyGenerate); //스토리 생성기 경로 등록


export default app;
const PORT = parseInt(process.env.PORT || '8080', 10);
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

// 서버 시작 실패 시 로그를 남기기 위한 안전장치 (선택사항)
server.on('error', (err) => {
    console.error('❌ Server failed to start:', err);
});