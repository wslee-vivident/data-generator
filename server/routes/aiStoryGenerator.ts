import express from 'express';
import { GenerationMode, PipelineContext } from '../types';
import { buildStoryRouteGraph, StoryInput } from '../services/storyWorkflow';
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
// 2. 공통 핸들러
//
//    라우트 레벨 DAG 실행:
//    DataParse ───┐
//                  ├→ Grouping ─→ Generation ──┐
//    PromptLoad ──┘                             ├→ Merge → SheetUpdate
//                                SheetFetch ───┘
// ==========================================
async function handleStoryGeneration(
    req: express.Request,
    res: express.Response,
    mode: GenerationMode,
) {
    console.log(`📥 [POST] Story Generation (DAG) - Mode: ${mode}`);

    try {
        const { data, dictionary, sheetName, sheetId, promptFile, emotions } = req.body;

        // 입력 검증 (DAG 진입 전 boundary check)
        if (!data || !Array.isArray(data) || data.length < 2) {
            return res.status(400).json({ error: "Invalid data format" });
        }
        if (!promptFile) {
            return res.status(400).json({ error: "promptFile required" });
        }

        // 제네릭 파이프라인 컨텍스트 생성
        const ctx: PipelineContext<StoryInput> = {
            input: {
                mode,
                sheetId,
                sheetName,
                promptFile,
                rawData: data,
                dictionary: dictionary || {},
                emotions,
            },
            outputs: {},
            config: {},
            history: [],
            metadata: {},
        };

        // DAG 실행
        const graph = buildStoryRouteGraph();
        const result = await graph.execute(ctx);

        if (!result.success) {
            const errorSummary = result.errors
                .map(e => `[${e.nodeId}] ${e.error.message}`)
                .join(', ');
            throw new Error(`DAG 실행 실패: ${errorSummary}`);
        }

        const generationResults = ctx.outputs['generation'] as any[] ?? [];

        return res.status(200).json({
            status: "OK",
            count: generationResults.length,
            results: generationResults,
        });

    } catch (err: any) {
        console.error("🔥 Error:", err);
        res.status(500).json({ error: err.message });
    }
}

export default router;
