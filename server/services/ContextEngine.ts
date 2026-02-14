import { BaseStoryRow, GenerationMode } from '../types';
import { ContextProvider } from './contextProviders';
const nunjucks = require("nunjucks");

// =================================================================
//  ContextEngine - 컨텍스트 합성 엔진
//  등록된 ContextProvider들에게 정보를 요청하고,
//  수집된 변수들을 nunjucks 템플릿에 적용하여 프롬프트를 생성합니다.
//
//  PromptEngine의 진화형으로, 하드코딩된 if/else 대신
//  플러그인 방식으로 컨텍스트를 확장할 수 있습니다.
// =================================================================

export class ContextEngine {
    private providers: ContextProvider[] = [];
    private mainTemplate: string;

    constructor(mainTemplate: string) {
        this.mainTemplate = mainTemplate;
    }

    /**
     * 컨텍스트 프로바이더 등록 (체이닝 지원)
     * 순서대로 호출되며, 나중에 등록된 Provider가 같은 키를 덮어쓸 수 있습니다.
     */
    addProvider(provider: ContextProvider): this {
        this.providers.push(provider);
        return this;
    }

    /**
     * 컨텍스트 변수만 수집 (렌더링 없이)
     * DAG 파이프라인에서 ContextNode가 사용합니다.
     * 변수 수집과 템플릿 렌더링을 분리하여 각 단계를 독립적으로 제어할 수 있습니다.
     */
    collectVariables(row: BaseStoryRow, history: string[], mode: GenerationMode): Record<string, string> {
        const templateVars: Record<string, string> = {};

        for (const provider of this.providers) {
            if (provider.canProvide(row, mode)) {
                const provided = provider.provide(row, history);
                Object.assign(templateVars, provided);
            }
        }

        return templateVars;
    }

    /**
     * 프롬프트 빌드
     * 1. 등록된 Provider들에게서 canProvide() 체크 후 변수 수집
     * 2. 모든 변수를 병합
     * 3. nunjucks로 템플릿 렌더링
     */
    buildPrompt(row: BaseStoryRow, history: string[], mode: GenerationMode): string {
        const templateVars = this.collectVariables(row, history, mode);

        // nunjucks 렌더링 ({{variable}}과 {% if %} 블록 모두 처리)
        return nunjucks.renderString(this.mainTemplate, templateVars);
    }
}
