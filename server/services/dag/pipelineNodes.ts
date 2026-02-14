import { IPipelineNode, PipelineContext } from './types';
import { ContextEngine } from '../ContextEngine';
import { ILLMAdapter } from './LLMAdapter';
import { LLMModelName } from '../../types';
import {
    parseSingleLineText,
    parseFullScriptPSV,
    parseSingleLineJSON,
    parseFullScriptJSON,
} from '../outputParsers';
const nunjucks = require('nunjucks');

// =================================================================
//  파이프라인 노드 구현체
//
//  각 노드는 PipelineContext의 특정 필드를 읽고/쓰며 단일 책임을 수행합니다.
//  DAG 그래프에서 의존성으로 연결되어 실행 순서가 결정됩니다.
//
//  기본 파이프라인:
//    ContextNode → PromptNode ─┐
//                               ├→ LLMNode → ParseNode
//    InputBuildNode ───────────┘
// =================================================================

// =================================================================
//  1. ContextNode - 컨텍스트 변수 수집
//  ContextEngine + ContextProvider들로부터 템플릿 변수를 수집합니다.
//  출력: ctx.templateVars
// =================================================================

export class ContextNode implements IPipelineNode {
    readonly id = 'context';
    readonly name = '컨텍스트 변수 수집';
    private engine: ContextEngine;

    constructor(engine: ContextEngine) {
        this.engine = engine;
    }

    async execute(ctx: PipelineContext): Promise<void> {
        ctx.templateVars = this.engine.collectVariables(ctx.row, ctx.history, ctx.mode);
    }
}

// =================================================================
//  2. PromptNode - 프롬프트 렌더링
//  수집된 templateVars를 nunjucks 템플릿에 적용하여 systemPrompt를 생성합니다.
//  입력: ctx.templateVars, ctx.template
//  출력: ctx.systemPrompt
// =================================================================

export class PromptNode implements IPipelineNode {
    readonly id = 'prompt';
    readonly name = '프롬프트 렌더링';

    async execute(ctx: PipelineContext): Promise<void> {
        ctx.systemPrompt = nunjucks.renderString(ctx.template, ctx.templateVars);
    }
}

// =================================================================
//  3. InputBuildNode - 사용자 입력 텍스트 빌드
//  모드에 따라 LLM에 전달할 user 메시지를 구성합니다.
//  입력: ctx.row, ctx.mode, ctx.history
//  출력: ctx.inputText
// =================================================================

export class InputBuildNode implements IPipelineNode {
    readonly id = 'input-build';
    readonly name = '입력 텍스트 빌드';

    async execute(ctx: PipelineContext): Promise<void> {
        if (ctx.mode === 'single_line') {
            const introContext = ctx.row['introContext'] || '';
            ctx.inputText = `you are a story writer who is an expert of Visual Novel style game in scenario. your story is starting from ${introContext}`;
        } else if (ctx.mode === 'full_script') {
            ctx.inputText = [
                'you are a story writer who is an expert of Visual Novel style game in scenario.',
                ctx.history.join('\n'),
                'Now, generate the next part of the story based on the prompt.',
            ].join('\n');
        } else {
            ctx.inputText = '';
        }
    }
}

// =================================================================
//  4. LLMNode - LLM 호출
//  LLMAdapter를 통해 AI 모델에 프롬프트를 전달하고 응답을 받습니다.
//  입력: ctx.systemPrompt, ctx.inputText, ctx.row (model, temperature)
//  출력: ctx.llmRawOutput, ctx.metadata.llmModel
// =================================================================

export class LLMNode implements IPipelineNode {
    readonly id = 'llm';
    readonly name = 'LLM 호출';
    private adapter: ILLMAdapter;

    constructor(adapter: ILLMAdapter) {
        this.adapter = adapter;
    }

    async execute(ctx: PipelineContext): Promise<void> {
        const modelName = (ctx.row.model?.toLowerCase() || 'gemini_flash') as LLMModelName;
        const temperature = ctx.row.temperature ?? 0.5;

        const response = await this.adapter.send({
            model: modelName,
            inputText: ctx.inputText,
            systemPrompt: ctx.systemPrompt,
            temperature,
        });

        ctx.llmRawOutput = response.text;
        ctx.metadata.llmModel = response.model;
    }
}

// =================================================================
//  5. ParseNode - 출력 파싱
//  LLM 응답을 모드에 맞는 파서로 파싱하여 StoryResult 배열로 변환합니다.
//  입력: ctx.llmRawOutput, ctx.mode, ctx.row
//  출력: ctx.results
// =================================================================

export type ParserType = 'text' | 'json';

export class ParseNode implements IPipelineNode {
    readonly id = 'parse';
    readonly name = '출력 파싱';
    private parserType: ParserType;

    constructor(parserType: ParserType = 'text') {
        this.parserType = parserType;
    }

    async execute(ctx: PipelineContext): Promise<void> {
        const raw = ctx.llmRawOutput;

        if (ctx.mode === 'full_script') {
            const sceneId = ctx.row['sceneId'] || 'unknown_scene';
            ctx.results = this.parserType === 'json'
                ? parseFullScriptJSON(raw, sceneId)
                : parseFullScriptPSV(raw, sceneId);
        } else {
            const key = ctx.row['key'] || '';
            const text = this.parserType === 'json'
                ? parseSingleLineJSON(raw, key)
                : parseSingleLineText(raw, key);
            ctx.results = [{ key, result: text }];
        }
    }
}

// =================================================================
//  커스텀 노드 예시 (확장 가이드)
// =================================================================

/**
 * 커스텀 노드 작성법:
 *
 * 1. IPipelineNode 인터페이스를 구현합니다.
 * 2. 고유한 id를 부여합니다 (DAG 내에서 유일해야 함).
 * 3. execute()에서 PipelineContext의 필요한 필드를 읽고/씁니다.
 * 4. DAGGraph에 addNode()로 등록하고 의존성을 지정합니다.
 *
 * 예시: 번역 후처리 노드
 *   export class TranslationPostProcessNode implements IPipelineNode {
 *       readonly id = 'translate-post';
 *       readonly name = '번역 후처리';
 *       async execute(ctx: PipelineContext): Promise<void> {
 *           ctx.results = ctx.results.map(r => ({
 *               ...r,
 *               result: r.result.replace(/\n+/g, ' ').trim(),
 *           }));
 *       }
 *   }
 *
 * 등록:
 *   graph.addNode(new TranslationPostProcessNode(), ['parse']);
 */
