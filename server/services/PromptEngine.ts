import { BaseStoryRow, GenerationMode } from '../types';
import { ContextEngine } from './ContextEngine';
import {
    DictionaryProvider,
    CommonRowProvider,
    CharacterProfileProvider,
    ConversationHistoryProvider,
    FullScriptProfileProvider,
} from './contextProviders';

// =================================================================
//  PromptEngine - ContextEngine의 하위 호환 래퍼
//  기존 코드(StoryOrchestrator, aiStoryGenerator)에서 수정 없이 사용 가능
//  내부적으로 Context Provider 패턴을 사용합니다.
// =================================================================

export class PromptEngine {
    private contextEngine: ContextEngine;

    constructor(mainTemplateContent: string, dictionaryObj: Record<string, string>) {
        this.contextEngine = new ContextEngine(mainTemplateContent);

        // 기본 Provider 등록 (기존 PromptEngine 기능과 동일한 결과)
        this.contextEngine
            .addProvider(new DictionaryProvider(dictionaryObj))
            .addProvider(new CommonRowProvider())
            .addProvider(new CharacterProfileProvider())
            .addProvider(new ConversationHistoryProvider())
            .addProvider(new FullScriptProfileProvider());
    }

    /**
     * 프롬프트 빌드 (기존 시그니처와 동일)
     * 내부적으로 ContextEngine에 위임합니다.
     */
    public buildPrompt(row: BaseStoryRow, history: string[], mode: GenerationMode): string {
        return this.contextEngine.buildPrompt(row, history, mode);
    }

    /**
     * 내부 ContextEngine 접근 (새 Provider 추가시 사용)
     */
    public getContextEngine(): ContextEngine {
        return this.contextEngine;
    }
}
