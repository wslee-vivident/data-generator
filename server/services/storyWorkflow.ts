import { BaseStoryRow, GenerationMode, StoryResult, PipelineContext, LLMModelName } from '../types';
import { DAGGraph } from './dagGraph';
import { FunctionalNode, LLMNode } from './standardNodes';
import { DefaultLLMAdapter, ILLMAdapter } from './llmAdapter';
import {
    StoryInput,
    StoryRowInput,
    parseData,
    loadMainTemplate,
    groupRows,
    fetchSheetData,
    mergeResults,
    updateSheet,
    createContextCollector,
    renderPrompt,
    buildInputText,
    parseOutput,
    buildLLMRequest,
    extractHistoryLines,
} from './storyTools';

// =================================================================
//  스토리 워크플로우 (Feature Layer)
//
//  코어 엔진(DAGGraph, FunctionalNode, LLMNode)과
//  도메인 함수(storyTools)를 조합하여 실행 가능한 그래프를 구성합니다.
//
//  라우트 레벨 DAG:
//    DataParse ───┐
//                  ├→ Grouping ─→ Generation ──┐
//    PromptLoad ──┘                             ├→ Merge → SheetUpdate
//                                SheetFetch ───┘
//
//  행 레벨 LLM DAG (per row):
//    Context ──→ Prompt ───┐
//       │                   ├──→ LLM ──→ Parse
//       └──→ InputBuild ──┘
// =================================================================

// StoryInput, StoryRowInput 타입 재수출 (라우트에서 사용)
export { StoryInput, StoryRowInput } from './storyTools';

/**
 * 라우트 레벨 DAG 구성
 *
 * HTTP 요청의 전체 처리 흐름을 DAG 노드로 구성합니다.
 * 독립 노드(DataParse, PromptLoad, SheetFetch)는 병렬 실행되며,
 * 의존 관계에 따라 자동으로 실행 순서가 결정됩니다.
 */
export function buildStoryRouteGraph(): DAGGraph<StoryInput> {
    const graph = new DAGGraph<StoryInput>();

    graph
        // 독립 노드 (병렬 실행)
        .addNode(new FunctionalNode<StoryInput>({
            id: 'data-parse',
            name: '데이터 파싱',
            action: parseData,
        }), [])
        .addNode(new FunctionalNode<StoryInput>({
            id: 'prompt-load',
            name: '프롬프트 로드',
            action: loadMainTemplate,
        }), [])
        .addNode(new FunctionalNode<StoryInput>({
            id: 'sheet-fetch',
            name: '시트 데이터 조회',
            action: fetchSheetData,
        }), [])
        // 데이터 의존 노드
        .addNode(new FunctionalNode<StoryInput>({
            id: 'grouping',
            name: '그룹핑',
            action: groupRows,
        }), ['data-parse'])
        .addNode(new FunctionalNode<StoryInput>({
            id: 'generation',
            name: 'LLM 생성',
            action: generateForGroups,
        }), ['grouping', 'prompt-load'])
        // 결과 처리 노드
        .addNode(new FunctionalNode<StoryInput>({
            id: 'merge',
            name: '결과 병합',
            action: mergeResults,
        }), ['generation', 'sheet-fetch'])
        .addNode(new FunctionalNode<StoryInput>({
            id: 'sheet-update',
            name: '시트 업데이트',
            action: updateSheet,
        }), ['merge']);

    return graph;
}

/**
 * 행 레벨 LLM 파이프라인 DAG 구성
 *
 * 단일 row에 대한 LLM 호출 파이프라인을 구성합니다.
 * ContextEngine 액션과 LLMAdapter를 주입받아 도메인 로직을 결정합니다.
 *
 * @param adapter - LLM 어댑터 (DefaultLLMAdapter 또는 커스텀)
 * @param contextAction - createContextCollector()로 생성된 컨텍스트 수집 함수
 */
export function buildStoryLLMGraph(
    adapter: ILLMAdapter,
    contextAction: (ctx: PipelineContext<StoryRowInput>) => Promise<void>,
): DAGGraph<StoryRowInput> {
    const graph = new DAGGraph<StoryRowInput>();

    graph
        .addNode(new FunctionalNode<StoryRowInput>({
            id: 'context',
            name: '컨텍스트 변수 수집',
            action: contextAction,
        }), [])
        .addNode(new FunctionalNode<StoryRowInput>({
            id: 'prompt',
            name: '프롬프트 렌더링',
            action: renderPrompt,
        }), ['context'])
        .addNode(new FunctionalNode<StoryRowInput>({
            id: 'input-build',
            name: '입력 텍스트 빌드',
            action: buildInputText,
        }), ['context'])
        .addNode(new LLMNode<StoryRowInput>({
            id: 'llm',
            name: 'LLM 호출',
            adapter,
            buildPrompt: buildLLMRequest,
        }), ['prompt', 'input-build'])
        .addNode(new FunctionalNode<StoryRowInput>({
            id: 'parse',
            name: '출력 파싱',
            action: parseOutput,
        }), ['llm']);

    return graph;
}

// =================================================================
//  내부 오케스트레이션 함수
// =================================================================

/**
 * 그룹별 LLM 생성 실행
 *
 * 라우트 DAG의 'generation' 노드에서 호출됩니다.
 * 각 그룹(Scene/Character)에 대해 행 파이프라인을 구성하고,
 * 그룹 간 병렬 / 그룹 내 순차(히스토리 연속성) 실행합니다.
 */
async function generateForGroups(ctx: PipelineContext<StoryInput>): Promise<void> {
    const groups = ctx.outputs['grouping'] as Record<string, BaseStoryRow[]>;
    const template = ctx.outputs['prompt-load'] as string;
    const { dictionary, mode } = ctx.input;
    const adapter = new DefaultLLMAdapter();

    const tasks = Object.entries(groups).map(async ([groupKey, rows]) => {
        console.log(`  🚀 그룹: ${groupKey} (${rows.length} rows)`);
        return executeRowPipeline(rows, mode, template, dictionary, adapter);
    });

    const resultsArrays = await Promise.all(tasks);
    ctx.outputs['generation'] = resultsArrays.flat();
    console.log(`  ⭐ 총 ${(ctx.outputs['generation'] as any[]).length}개 결과 생성`);
}

/**
 * 행 단위 파이프라인 순차 실행
 *
 * 동일 그룹 내 row들을 순차 처리하며 대화 히스토리를 유지합니다.
 * 매 row마다 새 DAG 그래프를 생성하여 상태 격리를 보장합니다.
 *
 * @param rows - 동일 그룹의 row 목록
 * @param mode - 생성 모드 (single_line / full_script)
 * @param template - 프롬프트 템플릿
 * @param dictionary - 용어 사전
 * @param adapter - LLM 어댑터
 */
async function executeRowPipeline(
    rows: BaseStoryRow[],
    mode: GenerationMode,
    template: string,
    dictionary: Record<string, string>,
    adapter: ILLMAdapter,
): Promise<StoryResult[]> {
    const allResults: StoryResult[] = [];
    const history: string[] = [];

    // ContextEngine은 그룹 내에서 공유 (한 번만 생성)
    const contextAction = createContextCollector(template, dictionary);

    for (const row of rows) {
        try {
            const graph = buildStoryLLMGraph(adapter, contextAction);

            const ctx: PipelineContext<StoryRowInput> = {
                input: { row, mode, template, dictionary },
                outputs: {},
                config: {},
                history: [...history],
                metadata: {},
            };

            const result = await graph.execute(ctx);

            if (result.success) {
                const parsed = ctx.outputs['parse'] as StoryResult[];
                allResults.push(...parsed);
                history.push(...extractHistoryLines(parsed, row, mode));
            } else {
                const key = row['key'] || row['sceneId'];
                const errorSummary = result.errors
                    .map(e => `[${e.nodeId}] ${e.error.message}`)
                    .join(', ');
                console.error(`❌ Row '${key}' DAG 실행 실패: ${errorSummary}`);
            }
        } catch (error) {
            console.error(`❌ Row 처리 오류:`, error);
        }
    }

    return allResults;
}
