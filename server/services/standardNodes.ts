import { INode, PipelineContext } from '../types';
import { ILLMAdapter } from './llmAdapter';
import { LLMRequest } from './llmRouter';

// =================================================================
//  표준 노드 (Core)
//
//  도메인에 무관한 범용 노드 구현체.
//  비즈니스 로직은 생성자에 주입된 함수에 의해 결정됩니다.
//
//  FunctionalNode<T> — 임의 함수를 노드로 래핑
//  LLMNode<T>        — LLM 호출을 노드로 래핑 (프롬프트 빌더 주입)
// =================================================================

/**
 * FunctionalNode<T> - 함수 주입 노드
 *
 * 어떤 비동기 함수든 DAG 노드로 변환합니다.
 * 도메인 로직은 action 콜백에 주입하므로 코어 엔진 수정 없이 확장 가능.
 *
 * @example
 *   new FunctionalNode({
 *       id: 'parse',
 *       name: '데이터 파싱',
 *       action: async (ctx) => { ctx.outputs['parse'] = parseData(ctx.input); }
 *   })
 */
export class FunctionalNode<T = any> implements INode<T> {
    readonly id: string;
    readonly name: string;
    private action: (ctx: PipelineContext<T>) => Promise<void>;

    constructor(config: {
        id: string;
        name: string;
        action: (ctx: PipelineContext<T>) => Promise<void>;
    }) {
        this.id = config.id;
        this.name = config.name;
        this.action = config.action;
    }

    async execute(ctx: PipelineContext<T>): Promise<void> {
        await this.action(ctx);
    }
}

/**
 * LLMNode<T> - LLM 호출 노드
 *
 * buildPrompt 콜백으로 컨텍스트에서 LLMRequest를 조립하고,
 * ILLMAdapter를 통해 모델을 호출합니다.
 * 응답은 ctx.outputs[this.id]에 LLMResponse로 저장됩니다.
 *
 * @example
 *   new LLMNode({
 *       id: 'llm',
 *       adapter: myAdapter,
 *       buildPrompt: (ctx) => ({
 *           model: 'claude',
 *           systemPrompt: ctx.outputs['prompt'],
 *           inputText: ctx.outputs['input'],
 *           temperature: 0.7,
 *       }),
 *   })
 */
export class LLMNode<T = any> implements INode<T> {
    readonly id: string;
    readonly name: string;
    private adapter: ILLMAdapter;
    private buildPrompt: (ctx: PipelineContext<T>) => LLMRequest;

    constructor(config: {
        id: string;
        name?: string;
        adapter: ILLMAdapter;
        buildPrompt: (ctx: PipelineContext<T>) => LLMRequest;
    }) {
        this.id = config.id;
        this.name = config.name ?? 'LLM 호출';
        this.adapter = config.adapter;
        this.buildPrompt = config.buildPrompt;
    }

    async execute(ctx: PipelineContext<T>): Promise<void> {
        const request = this.buildPrompt(ctx);
        const response = await this.adapter.send(request);
        ctx.outputs[this.id] = response;
    }
}
