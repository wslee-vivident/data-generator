import { LLMModelName } from '../types';
import { sendToClaude, sendToClaudeJSON } from './anthropicAI';
import { sendToOpenAI, sendToOpenAIJSON } from './openAI';
import { sendToGemini, sendToGeminiJSON } from './googleGemini';

// =================================================================
//  LLM 통합 라우터
//  모든 AI 서비스 호출을 단일 인터페이스로 통합
//  기존 switch(model) 중복을 제거합니다.
// =================================================================

// LLM 요청 인터페이스
export interface LLMRequest {
    model: LLMModelName;
    inputText: string;
    systemPrompt: string;
    temperature?: number;
}

// LLM 응답 인터페이스
export interface LLMResponse {
    text: string;
    model: LLMModelName;
}

// 모델별 핸들러 맵 (새 모델 추가시 여기에만 등록)
const LLM_HANDLERS: Record<LLMModelName, (input: string, system: string, temp: number) => Promise<string>> = {
    gpt: (input, system, temp) => sendToOpenAI(input, system, temp),
    claude: (input, system, temp) => sendToClaude(input, system, temp),
    gemini_pro: (input, system, temp) => sendToGemini(input, system, temp, 'gemini_pro'),
    gemini_flash: (input, system, temp) => sendToGemini(input, system, temp, 'gemini_flash'),
};

/**
 * 통합 LLM 호출 함수
 * 모델명에 따라 적절한 AI 서비스를 라우팅합니다.
 */
export async function sendToLLM(request: LLMRequest): Promise<LLMResponse> {
    const handler = LLM_HANDLERS[request.model];
    if (!handler) {
        throw new Error(`지원하지 않는 모델: ${request.model}`);
    }

    const temperature = request.temperature ?? 0.5;
    const text = await handler(request.inputText, request.systemPrompt, temperature);

    return { text, model: request.model };
}

// =================================================================
//  JSON 모드 LLM 핸들러 (Structured Output)
// =================================================================

// 모델별 JSON 핸들러 맵
const LLM_JSON_HANDLERS: Record<LLMModelName, (input: string, system: string, temp: number) => Promise<any>> = {
    gpt: (input, system, temp) => sendToOpenAIJSON(input, system, temp),
    claude: (input, system, temp) => sendToClaudeJSON(input, system, temp),
    gemini_pro: (input, system, temp) => sendToGeminiJSON(input, system, temp, 'gemini_pro'),
    gemini_flash: (input, system, temp) => sendToGeminiJSON(input, system, temp, 'gemini_flash'),
};

/**
 * 통합 LLM JSON 호출 함수
 * 구조화된 JSON 응답을 반환합니다.
 */
export async function sendToLLMJSON<T>(request: LLMRequest): Promise<T> {
    const handler = LLM_JSON_HANDLERS[request.model];
    if (!handler) {
        throw new Error(`지원하지 않는 모델 (JSON): ${request.model}`);
    }

    const temperature = request.temperature ?? 0.5;
    return await handler(request.inputText, request.systemPrompt, temperature);
}

/**
 * 모델명 문자열을 LLMModelName 타입으로 안전하게 변환
 * 지원하지 않는 모델명이면 에러를 던집니다.
 */
export function resolveModelName(raw: string | undefined): LLMModelName {
    const normalized = (raw || "").toLowerCase().trim();
    if (normalized in LLM_HANDLERS) {
        return normalized as LLMModelName;
    }
    throw new Error(`지원하지 않는 모델: ${normalized}`);
}
