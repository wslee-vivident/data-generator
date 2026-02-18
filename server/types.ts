// =================================================================
//  공통 타입 정의 (프로젝트 전역에서 사용)
// =================================================================

export type GenerationMode = 'single_line' | 'full_script';
export type LLMModelName = 'gpt' | 'claude' | 'gemini_pro' | 'gemini_flash';

// =================================================================
//  Story 도메인 타입 (Feature layer)
// =================================================================

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
//  DAG Core 타입 (Generic)
//
//  T = 입력 데이터 타입. StoryRow, UserQuery 등 무엇이든 가능.
//  코어 엔진은 T가 무엇인지 알 필요 없이 동작합니다.
// =================================================================

/** 노드 실행 상태 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 제네릭 파이프라인 컨텍스트
 *
 * - input: 불변 입력 데이터 (T)
 * - outputs: 각 노드의 실행 결과 저장소 (노드 ID → 결과)
 * - config: 워크플로우 설정
 * - history: 대화 연속성용 히스토리
 * - metadata: 확장 메타데이터
 */
export interface PipelineContext<T = any> {
    readonly input: T;
    outputs: Record<string, any>;
    config: Record<string, any>;
    history: string[];
    metadata: Record<string, any>;
}

/**
 * 제네릭 노드 인터페이스
 * 모든 파이프라인 단계는 이 인터페이스를 구현합니다.
 * 세부 로직은 구현체(FunctionalNode, LLMNode 등)에 주입합니다.
 */
export interface INode<T = any> {
    readonly id: string;
    readonly name: string;
    execute(ctx: PipelineContext<T>): Promise<void>;
}

/** DAG 노드 상태 래퍼 (실행 추적용) */
export interface DAGNodeState<T = any> {
    node: INode<T>;
    status: NodeStatus;
    dependencies: string[];
    error?: Error;
    startedAt?: number;
    completedAt?: number;
}

/** DAG 실행 결과 */
export interface DAGExecutionResult<T = any> {
    success: boolean;
    context: PipelineContext<T>;
    nodeStates: Map<string, DAGNodeState<T>>;
    errors: Array<{ nodeId: string; error: Error }>;
    durationMs: number;
}
