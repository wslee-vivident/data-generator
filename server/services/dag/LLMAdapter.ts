import { LLMRequest, LLMResponse, sendToLLM, sendToLLMJSON } from '../llmRouter';

// =================================================================
//  LLM 어댑터 인터페이스 및 기본 구현
//
//  기존 llmRouter의 함수들을 어댑터 패턴으로 래핑합니다.
//  테스트, Mock, 또는 커스텀 LLM 연동 시 ILLMAdapter를 구현하면 됩니다.
//
//  사용 예시:
//    const adapter = new DefaultLLMAdapter();
//    const response = await adapter.send({ model: 'claude', ... });
//
//  커스텀 어댑터:
//    class CachedLLMAdapter implements ILLMAdapter { ... }
// =================================================================

/** LLM 어댑터 인터페이스 */
export interface ILLMAdapter {
    /** 텍스트 응답 요청 */
    send(request: LLMRequest): Promise<LLMResponse>;
    /** JSON 구조화 응답 요청 */
    sendJSON<T>(request: LLMRequest): Promise<T>;
}

/**
 * 기본 LLM 어댑터
 * 기존 llmRouter의 sendToLLM / sendToLLMJSON을 래핑합니다.
 */
export class DefaultLLMAdapter implements ILLMAdapter {
    async send(request: LLMRequest): Promise<LLMResponse> {
        return sendToLLM(request);
    }

    async sendJSON<T>(request: LLMRequest): Promise<T> {
        return sendToLLMJSON<T>(request);
    }
}

/**
 * 로깅 LLM 어댑터 (디버그용)
 * 요청/응답을 콘솔에 출력하면서 실제 LLM 호출을 수행합니다.
 */
export class LoggingLLMAdapter implements ILLMAdapter {
    private inner: ILLMAdapter;

    constructor(inner: ILLMAdapter = new DefaultLLMAdapter()) {
        this.inner = inner;
    }

    async send(request: LLMRequest): Promise<LLMResponse> {
        console.log(`📤 LLM 요청 [${request.model}] (temp: ${request.temperature ?? 0.5})`);
        console.log(`   시스템 프롬프트: ${request.systemPrompt.substring(0, 100)}...`);
        console.log(`   입력 텍스트: ${request.inputText.substring(0, 100)}...`);

        const response = await this.inner.send(request);

        console.log(`📥 LLM 응답 [${response.model}]: ${response.text.substring(0, 200)}...`);
        return response;
    }

    async sendJSON<T>(request: LLMRequest): Promise<T> {
        console.log(`📤 LLM JSON 요청 [${request.model}]`);
        const response = await this.inner.sendJSON<T>(request);
        console.log(`📥 LLM JSON 응답:`, JSON.stringify(response).substring(0, 200));
        return response;
    }
}
