// =================================================================
//  DAG 파이프라인 모듈 - 공개 API
//
//  사용 예시:
//    import { DAGOrchestrator, DAGGraph, DefaultLLMAdapter } from './dag';
//
//    const orchestrator = new DAGOrchestrator({
//        rows, mainTemplate, dictionary, mode: 'single_line',
//    });
//    const results = await orchestrator.generateAll();
// =================================================================

// 핵심 타입
export type {
    PipelineContext,
    IPipelineNode,
    DAGNodeState,
    DAGExecutionResult,
    NodeStatus,
} from './types';

// DAG 실행 엔진
export { DAGGraph } from './DAGGraph';

// 오케스트레이터
export { DAGOrchestrator } from './DAGOrchestrator';
export type { DAGOrchestratorConfig, GraphFactory } from './DAGOrchestrator';

// LLM 어댑터
export { DefaultLLMAdapter, LoggingLLMAdapter } from './LLMAdapter';
export type { ILLMAdapter } from './LLMAdapter';

// 결과 집계기
export { ResultAggregator, DeduplicatingAggregator } from './ResultAggregator';
export type { IResultAggregator } from './ResultAggregator';

// 파이프라인 노드
export {
    ContextNode,
    PromptNode,
    InputBuildNode,
    LLMNode,
    ParseNode,
} from './pipelineNodes';
export type { ParserType } from './pipelineNodes';
