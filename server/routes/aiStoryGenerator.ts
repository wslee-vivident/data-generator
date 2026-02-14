import express from 'express';
import { parseSheetToObject, loadPrompt } from '../../shared/helpUtil';
import { StoryOrchestrator } from '../services/storyOrchestrator';
import { DAGOrchestrator } from '../services/dag';
import { getSheetData, updateSheetData } from '../services/googleSheet';
import { BaseStoryRow, StoryResult, GenerationMode } from '../types';
const router = express.Router();

// ==========================================
// 1. 라우터 정의
// ==========================================
router.post("/story-generate", async (req, res) => {
    return handleStoryGeneration(req, res, 'single_line');
});

router.post("/full-story-generate", async (req, res) => {
    return handleStoryGeneration(req, res, 'full_script');
});

// ==========================================
// 2. 공통 핸들러 (로직 통합)
// ==========================================
async function handleStoryGeneration(req: express.Request, res: express.Response, mode: 'single_line' | 'full_script') {
    console.log(`📥 [POST] Story Generation - Mode: ${mode}`);
    
    try {
        // req.body 파싱 (var 대신 let 사용, 공통 변수 추출)
        const { data, dictionary, sheetName, sheetId, promptFile } = req.body;
        
        // 추가 파라미터 (Full Script용)
        const { emotions } = req.body; // 필요하다면 사용

        if (!data || !Array.isArray(data) || data.length < 2) {
            return res.status(400).json({ error: "Invalid data format" });
        }
        if (!promptFile) return res.status(400).json({ error: "promptFile required" });

        // 1. 데이터 파싱
        const storyRows: BaseStoryRow[] = parseSheetToObject(data);
        
        // 2. 프롬프트 로드
        const mainTemplate = loadPrompt(promptFile);
        if (!mainTemplate) throw new Error(`Prompt file not found: ${promptFile}`);
        if(emotions && mode === 'full_script') {
            mainTemplate.replace("{{emotions}}", emotions ? emotions.join(", ") : "");
        }

        // 3. Scene핑
        const groupedRows = groupRowsBySceneId(storyRows, mode);
        
        // 4. 병렬 처리 실행 (DAG 기반 오케스트레이터)
        const tasks = Object.entries(groupedRows).map(async ([sceneId, rows]) => {
            console.log(`🚀 Scene: ${sceneId} (${rows.length} rows)`);
            const orchestrator = new DAGOrchestrator({
                rows,
                mainTemplate,
                dictionary,
                mode,
            });

            return await orchestrator.generateAll();
        });

        const resultsArrays = await Promise.all(tasks);
        const finalResults: StoryResult[] = resultsArrays.flat();

        // 5. 시트 업데이트 (모드별 전략 분기)
        if (finalResults.length > 0) {
            console.log("💾 Fetching current sheet data...");
            const currentSheetRows = await getSheetData(sheetId, sheetName);
            let mergedRows: any[] = [];

            if (mode === 'single_line') {
                // [기존 방식] Key가 일치하는 행만 찾아서 'result' 컬럼 업데이트
                console.log("Mode: Single Line (Update matching keys)");
                mergedRows = mergeStoryResultsInMemory(currentSheetRows, finalResults);
            } else {
                // [신규 방식] SceneId 기준 기존 행 삭제 -> 신규 행 추가
                console.log("Mode: Full Script (Replace scenes & Append new)");
                mergedRows = replaceSceneResultsInMemory(currentSheetRows, finalResults);
            }

            console.log(`💾 Updating sheet with ${mergedRows.length} rows...`);
            await updateSheetData(sheetId, sheetName, 2, mergedRows);
            console.log("✅ Sheet updated safely.");
        }

        return res.status(200).json({ status: "OK", count: finalResults.length, results: finalResults });

    } catch (err: any) {
        console.error("🔥 Error:", err);
        res.status(500).json({ error: err.message });
    }
}

// ==========================================
// 3. 헬퍼 함수들
// ==========================================

function groupRowsBySceneId(rows: BaseStoryRow[], mode:GenerationMode): Record<string, BaseStoryRow[]> {
    const groups: Record<string, BaseStoryRow[]> = {};
    for (const row of rows) {
        let groupKey = "";
        if(mode === 'full_script') {
           const char = String(row['character'] || "").trim();
           if(char) groupKey = char;
        } else {
            const sceneId = String(row['sceneId'] || "").trim();
            if(sceneId) groupKey = sceneId;
        }

        //2. 그룹핑
        if(groupKey) {
            if(!groups[groupKey]) {
                groups[groupKey] = [];
            }

            groups[groupKey].push(row);
        }
    }
    return groups;
}

/**
 * [Single Line 모드용]
 * 기존 시트 데이터에 Key가 일치하는 경우에만 result를 업데이트합니다.
 */
function mergeStoryResultsInMemory(originalRows: any[], newResults: StoryResult[]): any[] {
    const rowMap = new Map<string, any>();
    
    // 원본 데이터 보존
    originalRows.forEach(row => {
        const k = String(row.key || "").trim();
        if (k) rowMap.set(k, { ...row });
    });

    // 결과 병합
    for (const item of newResults) {
        const key = String(item.key).trim();
        const existing = rowMap.get(key);
        
        if (existing) {
            existing['result'] = item.result;
            rowMap.set(key, existing);
        }
    }
    return Array.from(rowMap.values());
}

/**
 * [Full Script 모드용]
 * 1. 생성된 결과들에 포함된 SceneId를 파악합니다.
 * 2. 기존 시트 데이터에서 해당 SceneId를 가진 행들을 모두 제거합니다.
 * 3. 생성된 결과를 새로운 행으로 변환하여 배열 끝에 추가합니다.
 */
function replaceSceneResultsInMemory(originalRows: any[], newResults: StoryResult[]): any[] {
    // 1. 새로 생성된 Scene ID 목록 추출
    // Key 형식이 "SceneID_Index" 라고 가정하고 파싱 (또는 StoryResult에 sceneId가 있다면 사용)
    const newSceneIds = new Set<string>();
    
    // newResults를 바로 행 객체로 변환할 준비
    const newRowObjects: any[] = newResults.map(item => {
        // Key에서 SceneId 추출 (예: "Chapter1_1" -> "Chapter1")
        // 만약 item 객체 안에 sceneId가 명시적으로 없다면 key 파싱 의존
        const keyParts = item.key.split('_');
        // 마지막 _숫자 부분을 제외한 나머지를 sceneId로 간주 (안전한 파싱 필요)
        const inferredSceneId = keyParts.length > 1 ? keyParts.slice(0, -1).join('_') : "unknown";
        
        newSceneIds.add(inferredSceneId);

        // Orchestrator에서 반환된 item이 이미 row 형태(speaker, emotion 포함)라면 그대로 사용
        // 만약 item이 {key, result} 뿐이라면 시트 컬럼에 맞춰 확장 필요
        // 여기서는 item 자체가 시트에 들어갈 객체 형태라고 가정하고 병합
        return {
            sceneId: inferredSceneId,
            ...item // key, result, (speaker, emotion 등이 포함되어 있다고 가정)
        };
    });

    console.log(`♻️ Replacing rows for scenes: [${Array.from(newSceneIds).join(', ')}]`);

    // 2. 기존 데이터에서, 이번에 새로 생성된 SceneId에 해당하는 행들을 '제외' (삭제)
    const preservedRows = originalRows.filter(row => {
        const currentSceneId = String(row.sceneId || "").trim();
        // 새로 생성된 씬 목록에 포함되지 않은 행만 남김
        return !newSceneIds.has(currentSceneId);
    });

    // 3. 보존된 행 뒤에 새로운 행 추가 (Append)
    // preservedRows(기존 안 건드린 씬) + newRowObjects(새로 쓴 씬)
    return [...preservedRows, ...newRowObjects];
}

export default router;