import { StoryRowData, StoryResult } from "../types";
import { PromptEngine } from "./PromptEngine";
import { sendToOpenAIWithTemperature } from "./openAI";
import { sendToGeminiWithTemperature } from "./googleGemini";
import { sendToClaudeWithTemperature } from "./anthropicAI";

export class StoryOrchestrator {
    private rows: StoryRowData[];
    private promptEngine: PromptEngine;
    private conversationHistory: string[] = [];

    constructor(rows: StoryRowData[], mainTemplate: string, dictionary: any) {
        this.rows = rows;
        this.promptEngine = new PromptEngine(mainTemplate, dictionary);
    }

    public async generateAll(): Promise<StoryResult[]> {
        const results: StoryResult[] = [];
        
        // Intro Context 추가
        if (this.rows.length > 0 && this.rows[0].introContext) {
            this.conversationHistory.push(`[System Intro]: ${this.rows[0].introContext}`);
        }

        console.log(`🚀 Start Story Orchestration (${this.rows.length} rows)`);

        for (const row of this.rows) {
            // direction이 없으면 생성을 스킵
            if (!row.direction || row.direction.trim() === "") {
                continue;
            }

            console.log(`\n▶ Processing [${row.key}] Speaker: ${row.speaker}`);

            try {
                // 1. 프롬프트 생성 (여기서 캐릭터 파일도 자동 로드됨)
                const prompt = this.promptEngine.buildPrompt(row, this.conversationHistory);

                // 2. 모델 분기 처리
                let generatedText = "";
                let inputText = `you are a story writer who is an expert of Visual Novel style game in scenario. your story is starting from ${row.introContext}`
                const modelKey = (row.model || "").toLowerCase();
                const temperature = (row.temperature || 0.5);
                
                switch (modelKey) {
                    case "claude" :
                        generatedText = await sendToClaudeWithTemperature(inputText, prompt, temperature);
                        break;
                    case "gpt" :
                        generatedText = await sendToOpenAIWithTemperature(inputText, prompt, temperature);
                        break;
                    case "gemini"  :
                        generatedText = await sendToGeminiWithTemperature(inputText, prompt, temperature);
                        break;
                    default:
                        throw new Error(`Unsupported model type: ${modelKey}`);
                }

                // 3. 결과 파싱 (CSV 포맷 "key, text"에서 text만 추출)
                const cleanText = this.parseOutput(generatedText, row.key);

                // 4. 히스토리 누적
                this.conversationHistory.push(`${row.speaker}: ${cleanText}`);

                // 5. 결과 수집
                results.push({
                    key: row.key,
                    result: cleanText
                });

                console.log(`   ✅ Output: ${cleanText.substring(0, 40)}...`);

            } catch (error) {
                console.error(`   ❌ Error:`, error);
                results.push({ key: row.key, result: "[Error]" });
            }
        }

        return results;
    }

    private parseOutput(text: string, key: string): string {
        const parts = text.split(",");
        if (parts.length >= 2) {
            // 첫 번째 쉼표 이후의 모든 텍스트를 합침 (대사에 쉼표 포함 가능성)
            return parts.slice(1).join(",").trim();
        }
        return text.replace(key, "").trim();
    }
}