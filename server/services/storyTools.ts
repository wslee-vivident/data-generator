import { BaseStoryRow, GenerationMode, StoryResult, PipelineContext, LLMModelName } from '../types';
import { parseSheetToObject, loadPrompt } from '../../shared/helpUtil';
import { getSheetData, updateSheetData } from './googleSheet';
import { ContextEngine } from './ContextEngine';
import {
    DictionaryProvider,
    CommonRowProvider,
    CharacterProfileProvider,
    ConversationHistoryProvider,
    FullScriptProfileProvider,
} from './contextProviders';
import {
    parseSingleLineText,
    parseFullScriptPSV,
    parseSingleLineJSON,
    parseFullScriptJSON,
} from './outputParsers';
import { LLMResponse } from './llmRouter';
const nunjucks = require('nunjucks');

// =================================================================
//  스토리 도메인 타입 및 도구 함수 (Feature Layer)
//
//  코어 엔진(dagGraph, standardNodes)에 주입할 도메인 로직을 정의합니다.
//  ContextEngine, Provider, outputParsers 등은 이 파일 내부에서만 사용되며
//  외부에는 순수 함수만 노출합니다.
// =================================================================

// =================================================================
//  입력 타입 정의
// =================================================================

/** 라우트 레벨 DAG 입력 (HTTP 요청에서 추출) */
export interface StoryInput {
    readonly mode: GenerationMode;
    readonly sheetId: string;
    readonly sheetName: string;
    readonly promptFile: string;
    readonly rawData: any[][];
    readonly dictionary: Record<string, string>;
    readonly emotions?: string[];
}

/** 행 레벨 LLM 파이프라인 입력 (row 단위 실행) */
export interface StoryRowInput {
    readonly row: BaseStoryRow;
    readonly mode: GenerationMode;
    readonly template: string;
    readonly dictionary: Record<string, string>;
}

// =================================================================
//  라우트 레벨 도구 함수
//  각 함수는 FunctionalNode<StoryInput>의 action으로 주입됩니다.
// =================================================================

/** 시트 2D 배열 → BaseStoryRow[] 파싱 */
export async function parseData(ctx: PipelineContext<StoryInput>): Promise<void> {
    ctx.outputs['data-parse'] = parseSheetToObject(ctx.input.rawData);
    console.log(`  📋 ${(ctx.outputs['data-parse'] as any[]).length}개 row 파싱 완료`);
}

/** 프롬프트 템플릿 파일 로드 */
export async function loadMainTemplate(ctx: PipelineContext<StoryInput>): Promise<void> {
    const template = loadPrompt(ctx.input.promptFile);
    if (!template) {
        throw new Error(`Prompt file not found: ${ctx.input.promptFile}`);
    }

    // emotions가 있으면 템플릿에 삽입
    if (ctx.input.emotions && ctx.input.mode === 'full_script') {
        ctx.outputs['prompt-load'] = template.replace('{{emotions}}', ctx.input.emotions.join(', '));
    } else {
        ctx.outputs['prompt-load'] = template;
    }
    console.log(`  📄 프롬프트 로드 완료: ${ctx.input.promptFile}`);
}

/** Scene/Character 기준 그룹핑 */
export async function groupRows(ctx: PipelineContext<StoryInput>): Promise<void> {
    const rows = ctx.outputs['data-parse'] as BaseStoryRow[];
    const groups: Record<string, BaseStoryRow[]> = {};

    for (const row of rows) {
        const key = ctx.input.mode === 'full_script'
            ? String(row['character'] || '').trim()
            : String(row['sceneId'] || '').trim();

        if (key) {
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        }
    }

    ctx.outputs['grouping'] = groups;
    console.log(`  🗂️ ${Object.keys(groups).length}개 그룹 생성 완료`);
}

/** Google Sheets에서 기존 데이터 조회 */
export async function fetchSheetData(ctx: PipelineContext<StoryInput>): Promise<void> {
    console.log(`  💾 시트 데이터 조회 중...`);
    ctx.outputs['sheet-fetch'] = await getSheetData(ctx.input.sheetId, ctx.input.sheetName);
    console.log(`  💾 기존 ${(ctx.outputs['sheet-fetch'] as any[]).length}개 행 조회 완료`);
}

/** 생성 결과를 기존 데이터에 병합 */
export async function mergeResults(ctx: PipelineContext<StoryInput>): Promise<void> {
    const results = ctx.outputs['generation'] as StoryResult[];
    const currentRows = ctx.outputs['sheet-fetch'] as any[];

    if (!results || results.length === 0) {
        console.log(`  ⏭️ 생성 결과 없음, 병합 스킵`);
        ctx.outputs['merge'] = [];
        return;
    }

    if (ctx.input.mode === 'single_line') {
        console.log(`  🔀 Single Line 병합 (키 매칭)`);
        ctx.outputs['merge'] = mergeByKey(currentRows, results);
    } else {
        console.log(`  🔀 Full Script 병합 (씬 교체)`);
        ctx.outputs['merge'] = replaceByScene(currentRows, results);
    }
    console.log(`  🔀 병합 완료: ${(ctx.outputs['merge'] as any[]).length}개 행`);
}

/** 병합된 결과를 시트에 저장 */
export async function updateSheet(ctx: PipelineContext<StoryInput>): Promise<void> {
    const merged = ctx.outputs['merge'] as any[];
    if (!merged || merged.length === 0) {
        console.log(`  ⏭️ 업데이트할 데이터 없음, 스킵`);
        return;
    }

    console.log(`  💾 시트 업데이트 중... (${merged.length}개 행)`);
    await updateSheetData(ctx.input.sheetId, ctx.input.sheetName, 2, merged);
    console.log(`  ✅ 시트 업데이트 완료`);
}

// =================================================================
//  행 레벨 LLM 파이프라인 도구 함수
//  각 함수는 FunctionalNode<StoryRowInput>의 action으로 주입됩니다.
// =================================================================

/**
 * ContextEngine 기반 컨텍스트 수집 액션 팩토리
 *
 * ContextEngine과 Provider를 한 번만 생성하고,
 * 반환된 함수를 여러 row에 재사용합니다.
 * → 그룹 내 모든 row가 동일한 엔진 인스턴스를 공유
 */
export function createContextCollector(
    template: string,
    dictionary: Record<string, string>,
): (ctx: PipelineContext<StoryRowInput>) => Promise<void> {
    const engine = new ContextEngine(template);
    engine
        .addProvider(new DictionaryProvider(dictionary))
        .addProvider(new CommonRowProvider())
        .addProvider(new CharacterProfileProvider())
        .addProvider(new ConversationHistoryProvider())
        .addProvider(new FullScriptProfileProvider());

    return async (ctx: PipelineContext<StoryRowInput>) => {
        ctx.outputs['context'] = engine.collectVariables(ctx.input.row, ctx.history, ctx.input.mode);
    };
}

/** 수집된 변수로 nunjucks 템플릿 렌더링 → systemPrompt 생성 */
export async function renderPrompt(ctx: PipelineContext<StoryRowInput>): Promise<void> {
    const templateVars = ctx.outputs['context'] as Record<string, string>;
    ctx.outputs['prompt'] = nunjucks.renderString(ctx.input.template, templateVars);
}

/** 모드에 따라 LLM user 메시지 빌드 */
export async function buildInputText(ctx: PipelineContext<StoryRowInput>): Promise<void> {
    const { row, mode } = ctx.input;

    if (mode === 'single_line') {
        const introContext = row['introContext'] || '';
        ctx.outputs['input-build'] = `you are a story writer who is an expert of Visual Novel style game in scenario. your story is starting from ${introContext}`;
    } else if (mode === 'full_script') {
        ctx.outputs['input-build'] = [
            'you are a story writer who is an expert of Visual Novel style game in scenario.',
            ctx.history.join('\n'),
            'Now, generate the next part of the story based on the prompt.',
        ].join('\n');
    } else {
        ctx.outputs['input-build'] = '';
    }
}

/** LLM 응답을 모드에 맞는 파서로 파싱 → StoryResult[] */
export async function parseOutput(ctx: PipelineContext<StoryRowInput>): Promise<void> {
    const response = ctx.outputs['llm'] as LLMResponse;
    const raw = response.text;
    const { row, mode } = ctx.input;
    const parserType = (ctx.config['parserType'] as string) || 'text';

    if (mode === 'full_script') {
        const sceneId = row['sceneId'] || 'unknown_scene';
        ctx.outputs['parse'] = parserType === 'json'
            ? parseFullScriptJSON(raw, sceneId)
            : parseFullScriptPSV(raw, sceneId);
    } else {
        const key = row['key'] || '';
        const text = parserType === 'json'
            ? parseSingleLineJSON(raw, key)
            : parseSingleLineText(raw, key);
        ctx.outputs['parse'] = [{ key, result: text }];
    }
}

/**
 * LLM 프롬프트 빌더 (LLMNode의 buildPrompt 콜백)
 * ctx.outputs에서 systemPrompt, inputText를 읽어 LLMRequest를 조립합니다.
 */
export function buildLLMRequest(ctx: PipelineContext<StoryRowInput>) {
    return {
        model: (ctx.input.row.model?.toLowerCase() || 'gemini_flash') as LLMModelName,
        inputText: ctx.outputs['input-build'] as string,
        systemPrompt: ctx.outputs['prompt'] as string,
        temperature: ctx.input.row.temperature ?? 0.5,
    };
}

// =================================================================
//  히스토리 · 병합 헬퍼
// =================================================================

/** 파싱 결과에서 히스토리 라인 추출 */
export function extractHistoryLines(
    results: StoryResult[],
    row: BaseStoryRow,
    mode: GenerationMode,
): string[] {
    if (mode === 'full_script') {
        return results.map(r => `${r.speaker}: ${r.text}`);
    } else {
        const speaker = row['speaker'] || 'unknown';
        return results.map(r => `${speaker}: ${r.result}`);
    }
}

/** [Single Line] Key가 일치하는 행의 result 컬럼만 업데이트 */
function mergeByKey(originalRows: any[], newResults: StoryResult[]): any[] {
    const rowMap = new Map<string, any>();

    originalRows.forEach(row => {
        const k = String(row.key || '').trim();
        if (k) rowMap.set(k, { ...row });
    });

    for (const item of newResults) {
        const key = String(item.key).trim();
        const existing = rowMap.get(key);
        if (existing) {
            existing['result'] = item.result;
            rowMap.set(key, existing);
        }
    }

    return Array.from(rowMap.values());
}

/** [Full Script] 해당 SceneId의 기존 행 제거 후 새 행 추가 */
function replaceByScene(originalRows: any[], newResults: StoryResult[]): any[] {
    const newSceneIds = new Set<string>();

    const newRowObjects = newResults.map(item => {
        const keyParts = item.key.split('_');
        const inferredSceneId = keyParts.length > 1
            ? keyParts.slice(0, -1).join('_')
            : 'unknown';
        newSceneIds.add(inferredSceneId);
        return { sceneId: inferredSceneId, ...item };
    });

    console.log(`  ♻️ 교체 대상 씬: [${Array.from(newSceneIds).join(', ')}]`);

    const preservedRows = originalRows.filter(row => {
        const currentSceneId = String(row.sceneId || '').trim();
        return !newSceneIds.has(currentSceneId);
    });

    return [...preservedRows, ...newRowObjects];
}
