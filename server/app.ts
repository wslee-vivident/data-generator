import express from 'express';
import batchTranslate from './routes/aiTranslate'; 

const app = express();

app.get("/", (req, res) => {
    res.send("Game Designer data generatr server is running.");   
});

app.use(express.json()); //JSON 파싱 미들웨어
app.use("/ai", batchTranslate); //ai 경로 등록


export default app;
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});