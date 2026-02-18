import express from 'express';
import { GenerationMode } from '../types';
import { DAGGraph } from '../services/dagGraph';
import {
    StoryRouteContext,
    DataParseNode,
    PromptLoadNode,
    GroupingNode,
    GenerationNode,
    SheetFetchNode,
    MergeNode,
    SheetUpdateNode,
} from '../services/dagStoryRouteNodes';
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
// 2. 라우트 레벨 DAG 구성
//
//    DataParseNode ───┐
//                      ├→ GroupingNode ─→ GenerationNode ──┐
//    PromptLoadNode ──┘                                     ├→ MergeNode → SheetUpdateNode
//                                          SheetFetchNode ──┘
//
//    - DataParseNode, PromptLoadNode, SheetFetchNode: 의존성 없이 병렬 실행
//    - GroupingNode: 데이터 파싱 완료 후 실행
//    - GenerationNode: 그룹핑 + 프롬프트 로드 완료 후 실행
//    - MergeNode: 생성 결과 + 시트 조회 완료 후 실행
//    - SheetUpdateNode: 병합 완료 후 실행
// ==========================================
function buildStoryDAG(): DAGGraph<StoryRouteContext> {
    const graph = new DAGGraph<StoryRouteContext>();

    graph
        // 독립 노드 (병렬 실행)
        .addNode(new DataParseNode(), [])
        .addNode(new PromptLoadNode(), [])
        .addNode(new SheetFetchNode(), [])
        // 데이터 의존 노드
        .addNode(new GroupingNode(), ['data-parse'])
        .addNode(new GenerationNode(), ['grouping', 'prompt-load'])
        // 결과 처리 노드
        .addNode(new MergeNode(), ['generation', 'sheet-fetch'])
        .addNode(new SheetUpdateNode(), ['merge']);

    return graph;
}

// ==========================================
// 3. 공통 핸들러
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

        // 라우트 컨텍스트 생성
        const ctx: StoryRouteContext = {
            mode,
            sheetId,
            sheetName,
            promptFile,
            rawData: data,
            dictionary: dictionary || {},
            emotions,
            // 노드 출력 초기값
            rows: [],
            mainTemplate: '',
            groupedRows: {},
            generationResults: [],
            currentSheetRows: [],
            mergedRows: [],
        };

        // DAG 실행
        const graph = buildStoryDAG();
        const result = await graph.execute(ctx);

        if (!result.success) {
            const errorSummary = result.errors
                .map(e => `[${e.nodeId}] ${e.error.message}`)
                .join(', ');
            throw new Error(`DAG 실행 실패: ${errorSummary}`);
        }

        return res.status(200).json({
            status: "OK",
            count: ctx.generationResults.length,
            results: ctx.generationResults,
        });

    } catch (err: any) {
        console.error("🔥 Error:", err);
        res.status(500).json({ error: err.message });
    }
}

export default router;
