import express from 'express';
import path from "path";
import { parseSheetToObject, loadPrompt } from '../../shared/helpUtil';
import { StoryOrchestrator  } from '../services/storyOrchestrator';
import { getSheetData, updateSheetData  } from '../services/googleSheet';
import { StoryRowData, StoryResult } from '../types';



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
            console.log("💾 Applying generated stories to sheet...");

            // Part.1: 현재 시트의 모든 데이터를 가져옴 (기존 데이터 보존)
            const currentSheetRows = await getSheetData(sheetId, sheetName);

            // Part.2: 메모리 상에서 기존 데이터에 생성된 결과(result)만 병합
            const mergedRows = mergeStoryResultsInMemory(currentSheetRows, finalResults);

            // Part.3: 병합된 전체 데이터를 시트에 한 번에 업데이트 (2번째 행부터 시작)
            await updateSheetData(sheetId, sheetName, 2, mergedRows);
            
            console.log("✅ Sheet updated safely.");
        } else {
            console.log("⚠️ No results generated, skipping sheet update.");
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

function mergeStoryResultsInMemory(
    originalRows: any[],
    newResults: StoryResult[]
): any[] {
    // 1. 검색 속도를 위해 기존 데이터를 Map으로 변환 (Key 기준)
    const rowMap = new Map<string, any>();
    originalRows.forEach(row => {
        // key 컬럼이 존재한다고 가정
        const k = String(row.key ?? "").trim();
        if (k) rowMap.set(k, { ...row });
    });

    // 2. 생성된 결과를 순회하며 Map 업데이트
    for (const item of newResults) {
        const normalizedKey = String(item.key).trim();
        const existing = rowMap.get(normalizedKey);

        if (existing) {
            // 해당 키가 시트에 존재할 경우에만 'result' 컬럼 업데이트
            if (item.result && item.result.trim() !== "") {
                existing['result'] = item.result;
            }
            // Map에 다시 저장 (객체 참조라 사실 필요 없지만 명시적으로)
            rowMap.set(normalizedKey, existing);
        } else {
            console.warn(`Skipping update for missing key: ${normalizedKey}`);
        }
    }

    // 3. Map을 다시 배열로 변환하여 반환
    return Array.from(rowMap.values());
}

export default router;