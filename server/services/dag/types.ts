import { BaseStoryRow, GenerationMode, StoryResult } from '../../types';

// =================================================================
//  DAG 파이프라인 핵심 타입 정의
//  노드 간 데이터 흐름과 실행 상태를 관리하는 인터페이스
// =================================================================

/** 노드 실행 상태 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 파이프라인 컨텍스트
 * DAG 실행 중 노드 간 데이터를 공유하는 객체.
 * 각 노드는 이 컨텍스트의 특정 필드를 읽고/쓰며 파이프라인을 진행합니다.
 *
 * 흐름: ContextNode → templateVars
 *       PromptNode → systemPrompt
 *       InputBuildNode → inputText
 *       LLMNode → llmRawOutput
 *       ParseNode → results
 */
export interface PipelineContext {
    // 불변 입력
    readonly row: BaseStoryRow;
    readonly mode: GenerationMode;
    readonly template: string;
    readonly dictionary: Record<string, string>;

    // 공유 상태 (Orchestrator가 row 간에 관리)
    history: string[];

    // 노드 출력 (각 노드가 순차적으로 채움)
    templateVars: Record<string, string>;
    systemPrompt: string;
    inputText: string;
    llmRawOutput: string;
    results: StoryResult[];

    // 확장 메타데이터 (커스텀 노드에서 자유롭게 사용)
    metadata: Record<string, any>;
}

/**
 * 파이프라인 노드 인터페이스
 * DAG의 각 단계를 나타내는 실행 단위.
 * 단일 책임: 컨텍스트에서 필요한 데이터를 읽고, 결과를 컨텍스트에 기록.
 */
export interface IPipelineNode {
    readonly id: string;
    readonly name: string;
    execute(ctx: PipelineContext): Promise<void>;
}

/**
 * DAG 노드 상태 래퍼
 * 실행 추적을 위한 메타 정보를 포함합니다.
 */
export interface DAGNodeState {
    node: IPipelineNode;
    status: NodeStatus;
    dependencies: string[];
    error?: Error;
    startedAt?: number;
    completedAt?: number;
}

/**
 * DAG 실행 결과
 */
export interface DAGExecutionResult {
    success: boolean;
    context: PipelineContext;
    nodeStates: Map<string, DAGNodeState>;
    errors: Array<{ nodeId: string; error: Error }>;
    durationMs: number;
}
