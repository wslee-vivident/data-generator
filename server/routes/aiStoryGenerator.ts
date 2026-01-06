import express from 'express';
import fs from "fs";
import path from "path";
import { updateSheetData } from 'server/services/googleSheet';
//import { StoryOrchestrator } from 'server/services/storyOrchestrator';
import { StoryRowData } from '../types'


const router = express.Router();

// GAS에서 보내는 순서대로 매핑 (GAS 스크립트의 resultHeader 참고)
const COLUMN_MAP = [
    "sceneId", "key", "speaker", "emotion", "level", 
    "direction", "location", "innerThought", 
    "narrationTone", "writingStyle", "introContext", "model"
];

router.post("/story-generate", async (req, res) => {
     console.log("📥 Received generation request");
    try {
            const { data, dictionary, sheetName, sheetId, promptFile } = req.body;

             // 1. 유효성 검사
            if (!data || !Array.isArray(data) || data.length === 0) {
                return res.status(400).json({ error: "Invalid data format" });
            }

             // 2. 데이터 파싱 (Array -> StoryRowData[])
            // GAS는 헤더 없이 값만 배열로 보낸다고 가정 (GAS 코드 확인 결과 값 배열들의 배열임)


            
            return res.status(200).json({ status: "OK"});
    
        } catch (err) {
            console.error("Error in /ai/batch-group-translate", err);
            res.status(500).json({ error: "Internal Server Error" });
        }
});

export default router;