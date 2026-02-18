// =================================================================
//  공통 타입 정의 (프로젝트 전역에서 사용)
// =================================================================

// 생성 모드 타입 (기존 3곳에 분산되어 있던 것을 통합)
export type GenerationMode = 'single_line' | 'full_script';

// LLM 모델명 타입 (llmRouter에서 사용)
export type LLMModelName = 'gpt' | 'claude' | 'gemini_pro' | 'gemini_flash';

export interface BaseStoryRow {
    sceneId : string;
    model? : string;
    temperature? : number;
    [key : string] : any;
}

export interface StoryRowData extends BaseStoryRow {
    sceneId: string;
    key: string;
    speaker: string;
    emotion: string;
    level: string | number;
    direction: string;
    location: string;
    innerThought: any;
    narrationTone: string;
    writingStyle: string;
    introContext: string;
}

export interface FullStoryRowData extends BaseStoryRow {
    character : string;
    level: string | number;
    systemKind : string;
    direction : string;
    place : string;
    location : string;
    emotions : string[];
}

export interface StoryResult {
    key: string;
    result: string;
    sceneId? : string;
    speaker? : string;
    emotion? : string;
    text? : string;
    choice_grade? : string;
    reply_text? : string;
}

// =================================================================
//  Orchestrator 설정 인터페이스
// =================================================================

/**
 * 출력 파서 인터페이스
 * StoryOrchestrator에서 LLM 응답을 파싱하는 전략을 정의합니다.
 */
export interface OutputParser {
    /** LLM 응답 텍스트를 StoryResult 배열로 변환 */
    parse(rawOutput: string, row: BaseStoryRow): StoryResult[];
    /** 파싱 결과에서 히스토리에 추가할 문자열을 생성 */
    toHistoryLines(results: StoryResult[], row: BaseStoryRow): string[];
}

/**
 * Orchestrator 설정
 * StoryOrchestrator 생성시 필요한 모든 의존성을 포함합니다.
 */
export interface OrchestratorConfig {
    rows: BaseStoryRow[];
    mainTemplate: string;
    dictionary: Record<string, string>;
    mode: GenerationMode;
}

// =================================================================
//  DAG 파이프라인 타입 정의
// =================================================================

/** 노드 실행 상태 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 파이프라인 컨텍스트
 * DAG 실행 중 노드 간 데이터를 공유하는 객체.
 *
 * 흐름: ContextNode → templateVars
 *       PromptNode → systemPrompt
 *       InputBuildNode → inputText
 *       LLMNode → llmRawOutput
 *       ParseNode → results
 */
export interface PipelineContext {
    readonly row: BaseStoryRow;
    readonly mode: GenerationMode;
    readonly template: string;
    readonly dictionary: Record<string, string>;
    history: string[];
    templateVars: Record<string, string>;
    systemPrompt: string;
    inputText: string;
    llmRawOutput: string;
    results: StoryResult[];
    metadata: Record<string, any>;
}

/**
 * 파이프라인 노드 인터페이스
 * DAG의 각 단계를 나타내는 실행 단위.
 */
export interface IPipelineNode {
    readonly id: string;
    readonly name: string;
    execute(ctx: PipelineContext): Promise<void>;
}

/** DAG 노드 상태 래퍼 (실행 추적용) */
export interface DAGNodeState {
    node: IPipelineNode;
    status: NodeStatus;
    dependencies: string[];
    error?: Error;
    startedAt?: number;
    completedAt?: number;
}

/** DAG 실행 결과 */
export interface DAGExecutionResult {
    success: boolean;
    context: PipelineContext;
    nodeStates: Map<string, DAGNodeState>;
    errors: Array<{ nodeId: string; error: Error }>;
    durationMs: number;
}