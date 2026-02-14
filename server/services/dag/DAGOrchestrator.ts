import { BaseStoryRow, GenerationMode, StoryResult } from '../../types';
import { ContextEngine } from '../ContextEngine';
import {
    DictionaryProvider,
    CommonRowProvider,
    CharacterProfileProvider,
    ConversationHistoryProvider,
    FullScriptProfileProvider,
} from '../contextProviders';
import { DAGGraph } from './DAGGraph';
import { PipelineContext } from './types';
import { DefaultLLMAdapter, ILLMAdapter } from './LLMAdapter';
import { ResultAggregator, IResultAggregator } from './ResultAggregator';
import {
    ContextNode,
    PromptNode,
    InputBuildNode,
    LLMNode,
    ParseNode,
    ParserType,
} from './pipelineNodes';

// =================================================================
//  DAGOrchestrator - DAG 기반 오케스트레이터
//
//  제어 흐름:
//    UserInput → Orchestrator
//    Orchestrator → ContextEngine → ContextProvider
//                 → PromptEngine (PromptNode)
//                 → LLMAdapter (LLMNode)
//                 → ResultAggregator → Orchestrator
//
//  각 row에 대해 DAG 파이프라인을 실행하고,
//  ResultAggregator를 통해 결과를 수집합니다.
//
//  기존 StoryOrchestrator와 동일한 외부 인터페이스(generateAll)를 제공하며,
//  내부적으로는 DAG 그래프 기반으로 실행합니다.
// =================================================================

/** DAG 그래프 팩토리 타입 */
export type GraphFactory = (
    engine: ContextEngine,
    adapter: ILLMAdapter,
    parserType: ParserType,
) => DAGGraph;

/** DAG 오케스트레이터 설정 */
export interface DAGOrchestratorConfig {
    rows: BaseStoryRow[];
    mainTemplate: string;
    dictionary: Record<string, string>;
    mode: GenerationMode;

    // 선택적 의존성 주입 (테스트, 커스텀 확장용)
    llmAdapter?: ILLMAdapter;
    contextEngine?: ContextEngine;
    aggregator?: IResultAggregator;
    graphFactory?: GraphFactory;
    parserType?: ParserType;
}

export class DAGOrchestrator {
    private config: DAGOrchestratorConfig;
    private contextEngine: ContextEngine;
    private llmAdapter: ILLMAdapter;
    private aggregator: IResultAggregator;
    private graphFactory: GraphFactory;
    private parserType: ParserType;

    constructor(config: DAGOrchestratorConfig) {
        this.config = config;
        this.parserType = config.parserType ?? 'text';
        this.llmAdapter = config.llmAdapter ?? new DefaultLLMAdapter();
        this.aggregator = config.aggregator ?? new ResultAggregator();
        this.contextEngine = config.contextEngine ?? this.buildDefaultContextEngine();
        this.graphFactory = config.graphFactory ?? DAGOrchestrator.defaultGraphFactory;
    }

    /**
     * 전체 row에 대해 DAG 파이프라인 실행
     * 기존 StoryOrchestrator.generateAll()과 동일한 인터페이스.
     */
    public async generateAll(): Promise<StoryResult[]> {
        console.log(`🔄 DAG Orchestrator 시작 (${this.config.rows.length} rows, mode: ${this.config.mode})`);

        for (const row of this.config.rows) {
            try {
                // 1. 파이프라인 컨텍스트 생성
                const ctx = this.createContext(row);

                // 2. DAG 그래프 생성 (매 row마다 새 그래프 인스턴스)
                const graph = this.graphFactory(
                    this.contextEngine,
                    this.llmAdapter,
                    this.parserType,
                );

                // 3. DAG 실행
                const result = await graph.execute(ctx);

                if (result.success) {
                    // 4. 결과 집계 (ResultAggregator)
                    this.aggregator.add(ctx.results);
                    const historyLines = this.extractHistoryLines(ctx);
                    this.aggregator.addHistoryLines(historyLines);
                } else {
                    const errorSummary = result.errors
                        .map(e => `[${e.nodeId}] ${e.error.message}`)
                        .join(', ');
                    console.error(`❌ Row '${row['key'] || row['sceneId']}' DAG 실행 실패: ${errorSummary}`);
                }
            } catch (error) {
                console.error(`❌ Row 처리 오류:`, error);
            }
        }

        const results = this.aggregator.getResults();
        console.log(`✅ DAG Orchestrator 완료 (${results.length} results)`);
        return results;
    }

    // =================================================================
    //  기본 구성 팩토리 메서드
    // =================================================================

    /**
     * 기본 ContextEngine 구성
     * 기존 PromptEngine과 동일한 Provider 세트를 등록합니다.
     */
    private buildDefaultContextEngine(): ContextEngine {
        const engine = new ContextEngine(this.config.mainTemplate);
        engine
            .addProvider(new DictionaryProvider(this.config.dictionary))
            .addProvider(new CommonRowProvider())
            .addProvider(new CharacterProfileProvider())
            .addProvider(new ConversationHistoryProvider())
            .addProvider(new FullScriptProfileProvider());
        return engine;
    }

    /**
     * 기본 DAG 그래프 팩토리
     *
     * 그래프 구조:
     *   ContextNode ──→ PromptNode ───┐
     *       │                          ├──→ LLMNode ──→ ParseNode
     *       └──→ InputBuildNode ──────┘
     *
     * ContextNode와 InputBuildNode는 PromptNode 이후 LLMNode에서 합류합니다.
     * PromptNode와 InputBuildNode는 각각 ContextNode에 의존하지만 서로 독립적이므로
     * 병렬 실행이 가능합니다.
     */
    static defaultGraphFactory(
        engine: ContextEngine,
        adapter: ILLMAdapter,
        parserType: ParserType,
    ): DAGGraph {
        const graph = new DAGGraph();

        graph
            .addNode(new ContextNode(engine), [])
            .addNode(new PromptNode(), ['context'])
            .addNode(new InputBuildNode(), ['context'])
            .addNode(new LLMNode(adapter), ['prompt', 'input-build'])
            .addNode(new ParseNode(parserType), ['llm']);

        return graph;
    }

    // =================================================================
    //  내부 유틸리티
    // =================================================================

    /** PipelineContext 생성 (각 row 실행 전) */
    private createContext(row: BaseStoryRow): PipelineContext {
        return {
            row,
            mode: this.config.mode,
            template: this.config.mainTemplate,
            dictionary: this.config.dictionary,
            history: [...this.aggregator.getHistory()],
            templateVars: {},
            systemPrompt: '',
            inputText: '',
            llmRawOutput: '',
            results: [],
            metadata: {},
        };
    }

    /** 파싱 결과에서 히스토리 라인 추출 */
    private extractHistoryLines(ctx: PipelineContext): string[] {
        if (ctx.mode === 'full_script') {
            return ctx.results.map(r => `${r.speaker}: ${r.text}`);
        } else {
            const speaker = ctx.row['speaker'] || 'unknown';
            return ctx.results.map(r => `${speaker}: ${r.result}`);
        }
    }

    // =================================================================
    //  공개 접근자 (고급 사용)
    // =================================================================

    /** ResultAggregator 접근 (히스토리 조작, 결과 조회 등) */
    public getAggregator(): IResultAggregator {
        return this.aggregator;
    }

    /** ContextEngine 접근 (런타임 Provider 추가 등) */
    public getContextEngine(): ContextEngine {
        return this.contextEngine;
    }
}
