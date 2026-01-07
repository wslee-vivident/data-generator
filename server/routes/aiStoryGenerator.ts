import express from 'express';
import path from "path";
import { parseSheetToObject } from '@shared/helpUtil';
import { loadPrompt } from '@shared/helpUtil';
import { StoryOrchestrator  } from 'server/services/storyOrchestrator';
import { updateStoryResults  } from 'server/services/googleSheet';
import { StoryRowData } from 'server/types';



const router = express.Router();


router.post("/story-generate", async (req, res) => {
    console.log("📥 [POST] /story-generate");
    try {
        const { data, dictionary, sheetName, sheetId, promptFile } = req.body;

        // 1. 입력값 검증
        if (!data || !Array.isArray(data) || data.length < 2) {
            return res.status(400).json({ error: "Invalid data format (Header required)" });
        }
        if (!promptFile) {
            return res.status(400).json({ error: "promptFile is required" });
        }

        // 2. 데이터 파싱
        const storyRows: StoryRowData[] = parseSheetToObject(data);
        console.log(`Parsed ${storyRows.length} rows.`);

        // 3. 메인 프롬프트 템플릿 로드
        const mainTemplate = loadPrompt(promptFile);
        if (!mainTemplate) {
            throw new Error(`Main prompt file not found: ${promptFile}`);
        }

        // 4. 오케스트레이션 실행
        // (내부에서 캐릭터별 프롬프트 파일을 동적으로 로드함)
        const orchestrator = new StoryOrchestrator(storyRows, mainTemplate, dictionary);
        const finalResults = await orchestrator.generateAll();

        // 5. 시트 업데이트 (Batch)
        // 기존 코드의 mergeTranslationsInMemory + updateSheetData 로직을 활용
        if (finalResults.length > 0) {
             console.log("💾 Updating sheet...");
             await updateStoryResults(sheetId, sheetName, finalResults);
        }

        // 6. 결과 응답
        return res.status(200).json({
            status: "OK",
            count: finalResults.length,
            results: finalResults
        });

    } catch (err: any) {
        console.error("🔥 Critical Error:", err);
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
});

export default router;