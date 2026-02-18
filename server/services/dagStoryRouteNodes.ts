import { BaseStoryRow, GenerationMode, StoryResult, IPipelineNode } from '../types';
import { parseSheetToObject, loadPrompt } from '../../shared/helpUtil';
import { getSheetData, updateSheetData } from './googleSheet';
import { DAGOrchestrator } from './dagOrchestrator';

// =================================================================
//  스토리 라우트 전용 DAG 노드
//
//  aiStoryGenerator 라우트의 전체 요청 처리를 DAG 노드로 구성합니다.
//  각 노드는 StoryRouteContext의 특정 필드를 읽고/쓰며 단일 책임을 수행합니다.
//
//  라우트 레벨 DAG 구조:
//    DataParseNode ───┐
//                      ├→ GroupingNode ─→ GenerationNode ──┐
//    PromptLoadNode ──┘                                     ├→ MergeNode → SheetUpdateNode
//                                          SheetFetchNode ──┘
// =================================================================

/**
 * 스토리 라우트 컨텍스트
 * 라우트 핸들러의 전체 요청/응답 데이터를 담는 공유 객체.
 */
export interface StoryRouteContext {
    // 불변 입력 (핸들러에서 설정)
    readonly mode: GenerationMode;
    readonly sheetId: string;
    readonly sheetName: string;
    readonly promptFile: string;
    readonly rawData: any[][];
    readonly dictionary: Record<string, string>;
    readonly emotions?: string[];

    // 노드 출력 (각 노드가 채움)
    rows: BaseStoryRow[];
    mainTemplate: string;
    groupedRows: Record<string, BaseStoryRow[]>;
    generationResults: StoryResult[];
    currentSheetRows: any[];
    mergedRows: any[];
}

// =================================================================
//  1. DataParseNode - 시트 데이터 파싱
//  2D 배열 → BaseStoryRow[] 변환
//  출력: ctx.rows
// =================================================================

export class DataParseNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'data-parse';
    readonly name = '데이터 파싱';

    async execute(ctx: StoryRouteContext): Promise<void> {
        ctx.rows = parseSheetToObject(ctx.rawData);
        console.log(`  📋 ${ctx.rows.length}개 row 파싱 완료`);
    }
}

// =================================================================
//  2. PromptLoadNode - 프롬프트 템플릿 로드
//  파일에서 프롬프트를 읽어 mainTemplate에 저장
//  출력: ctx.mainTemplate
// =================================================================

export class PromptLoadNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'prompt-load';
    readonly name = '프롬프트 로드';

    async execute(ctx: StoryRouteContext): Promise<void> {
        const template = loadPrompt(ctx.promptFile);
        if (!template) {
            throw new Error(`Prompt file not found: ${ctx.promptFile}`);
        }

        // emotions가 있으면 템플릿에 삽입
        if (ctx.emotions && ctx.mode === 'full_script') {
            ctx.mainTemplate = template.replace('{{emotions}}', ctx.emotions.join(', '));
        } else {
            ctx.mainTemplate = template;
        }
        console.log(`  📄 프롬프트 로드 완료: ${ctx.promptFile}`);
    }
}

// =================================================================
//  3. GroupingNode - Scene/Character 기준 그룹핑
//  모드에 따라 sceneId 또는 character 기준으로 row를 그룹핑
//  입력: ctx.rows, ctx.mode
//  출력: ctx.groupedRows
// =================================================================

export class GroupingNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'grouping';
    readonly name = '그룹핑';

    async execute(ctx: StoryRouteContext): Promise<void> {
        const groups: Record<string, BaseStoryRow[]> = {};

        for (const row of ctx.rows) {
            let groupKey = '';

            if (ctx.mode === 'full_script') {
                groupKey = String(row['character'] || '').trim();
            } else {
                groupKey = String(row['sceneId'] || '').trim();
            }

            if (groupKey) {
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(row);
            }
        }

        ctx.groupedRows = groups;
        const groupCount = Object.keys(groups).length;
        console.log(`  🗂️ ${groupCount}개 그룹 생성 완료`);
    }
}

// =================================================================
//  4. GenerationNode - DAG 오케스트레이터로 LLM 생성 실행
//  각 그룹별로 DAGOrchestrator를 생성하고 병렬 실행
//  입력: ctx.groupedRows, ctx.mainTemplate, ctx.dictionary, ctx.mode
//  출력: ctx.generationResults
// =================================================================

export class GenerationNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'generation';
    readonly name = 'LLM 생성';

    async execute(ctx: StoryRouteContext): Promise<void> {
        const tasks = Object.entries(ctx.groupedRows).map(async ([groupKey, rows]) => {
            console.log(`  🚀 그룹: ${groupKey} (${rows.length} rows)`);

            const orchestrator = new DAGOrchestrator({
                rows,
                mainTemplate: ctx.mainTemplate,
                dictionary: ctx.dictionary,
                mode: ctx.mode,
            });

            return orchestrator.generateAll();
        });

        const resultsArrays = await Promise.all(tasks);
        ctx.generationResults = resultsArrays.flat();
        console.log(`  ⭐ 총 ${ctx.generationResults.length}개 결과 생성`);
    }
}

// =================================================================
//  5. SheetFetchNode - 기존 시트 데이터 조회
//  Google Sheets에서 현재 데이터를 가져옴 (Generation과 병렬 실행 가능)
//  출력: ctx.currentSheetRows
// =================================================================

export class SheetFetchNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'sheet-fetch';
    readonly name = '시트 데이터 조회';

    async execute(ctx: StoryRouteContext): Promise<void> {
        console.log(`  💾 시트 데이터 조회 중...`);
        ctx.currentSheetRows = await getSheetData(ctx.sheetId, ctx.sheetName);
        console.log(`  💾 기존 ${ctx.currentSheetRows.length}개 행 조회 완료`);
    }
}

// =================================================================
//  6. MergeNode - 생성 결과를 기존 데이터에 병합
//  모드에 따라 merge(single_line) 또는 replace(full_script) 전략 사용
//  입력: ctx.generationResults, ctx.currentSheetRows, ctx.mode
//  출력: ctx.mergedRows
// =================================================================

export class MergeNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'merge';
    readonly name = '결과 병합';

    async execute(ctx: StoryRouteContext): Promise<void> {
        if (ctx.generationResults.length === 0) {
            console.log(`  ⏭️ 생성 결과 없음, 병합 스킵`);
            ctx.mergedRows = [];
            return;
        }

        if (ctx.mode === 'single_line') {
            console.log(`  🔀 Single Line 병합 (키 매칭)`);
            ctx.mergedRows = this.mergeByKey(ctx.currentSheetRows, ctx.generationResults);
        } else {
            console.log(`  🔀 Full Script 병합 (씬 교체)`);
            ctx.mergedRows = this.replaceByScene(ctx.currentSheetRows, ctx.generationResults);
        }
        console.log(`  🔀 병합 완료: ${ctx.mergedRows.length}개 행`);
    }

    /** [Single Line] Key가 일치하는 행의 result 컬럼만 업데이트 */
    private mergeByKey(originalRows: any[], newResults: StoryResult[]): any[] {
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
    private replaceByScene(originalRows: any[], newResults: StoryResult[]): any[] {
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
}

// =================================================================
//  7. SheetUpdateNode - 병합 결과를 시트에 저장
//  mergedRows가 비어있으면 스킵
//  입력: ctx.mergedRows, ctx.sheetId, ctx.sheetName
// =================================================================

export class SheetUpdateNode implements IPipelineNode<StoryRouteContext> {
    readonly id = 'sheet-update';
    readonly name = '시트 업데이트';

    async execute(ctx: StoryRouteContext): Promise<void> {
        if (ctx.mergedRows.length === 0) {
            console.log(`  ⏭️ 업데이트할 데이터 없음, 스킵`);
            return;
        }

        console.log(`  💾 시트 업데이트 중... (${ctx.mergedRows.length}개 행)`);
        await updateSheetData(ctx.sheetId, ctx.sheetName, 2, ctx.mergedRows);
        console.log(`  ✅ 시트 업데이트 완료`);
    }
}
