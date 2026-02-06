import { BaseStoryRow, StoryResult, GenerationMode, LLMModelName } from "../types";
import { PromptEngine } from "./PromptEngine";
import { sendToLLM } from "./llmRouter";
import { parseSingleLineText, parseFullScriptPSV } from "./outputParsers";

// =================================================================
//  StoryOrchestrator - 스토리 생성 오케스트레이터
//  역할: 순서 지휘만 담당 (프롬프트 조립, LLM 호출, 파싱은 외부 모듈에 위임)
// =================================================================

export class StoryOrchestrator {
    private rows: BaseStoryRow[];
    private promptEngine: PromptEngine;
    private history: string[] = [];
    private mode: GenerationMode;

    constructor(
        rows: BaseStoryRow[],
        mainTemplate: string,
        dictionary: any,
        mode: GenerationMode = 'single_line'
    ) {
        this.rows = rows;
        this.promptEngine = new PromptEngine(mainTemplate, dictionary);
        this.mode = mode;
    }

    public async generateAll(): Promise<StoryResult[]> {
        const results: StoryResult[] = [];

        for (const row of this.rows) {
            try {
                // 1. 프롬프트 생성 (PromptEngine → ContextEngine → Providers)
                const prompt = this.promptEngine.buildPrompt(row, this.history, this.mode);
                const temperature = row.temperature !== undefined ? row.temperature : 0.5;
                const inputText = this.buildInputText(row);

                // 2. 모델 호출 (LLM 통합 라우터)
                const modelName = (row.model?.toLowerCase() || "gemini_flash") as LLMModelName;
                const llmResponse = await sendToLLM({
                    model: modelName,
                    inputText,
                    systemPrompt: prompt,
                    temperature,
                });
                const rawOutput = llmResponse.text;

                // 3. 모드에 따른 결과 파싱 (outputParsers 모듈에 위임)
                if (this.mode === 'full_script') {
                    const sceneId = row['sceneId'] || "unknown_scene";
                    const parsedLines = parseFullScriptPSV(rawOutput, sceneId);
                    results.push(...parsedLines);

                    // 히스토리 업데이트
                    const historyLines = parsedLines.map(line => `${line['speaker']} : ${line['text']}`);
                    this.history.push(...historyLines);

                } else {
                    const cleanText = parseSingleLineText(rawOutput, row['key']);
                    results.push({
                        key: row['key'],
                        result: cleanText
                    });
                    this.history.push(`${row['speaker']}: ${cleanText}`);
                }

            } catch (error) {
                console.error(`❌ Row 처리 오류:`, error);
            }
        }
        return results;
    }

    /**
     * 모드에 따른 inputText 구성
     * system prompt(PromptEngine 결과)와 별도로, user 메시지를 만듭니다.
     */
    private buildInputText(row: BaseStoryRow): string {
        if (this.mode === 'single_line') {
            return `you are a story writer who is an expert of Visual Novel style game in scenario. your story is starting from ${row.introContext}`;
        } else if (this.mode === 'full_script') {
            return `you are a story writer who is an expert of Visual Novel style game in scenario. \n
                    ${this.history.join("\n")}\n Now, generate the next part of the story based on the prompt.`;
        }
        return "";
    }
}
