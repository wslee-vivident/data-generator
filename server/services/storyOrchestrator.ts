import { BaseStoryRow, StoryResult } from "../types";
import { PromptEngine } from "./PromptEngine";
import { sendToOpenAI } from "./openAI";
import { sendToGemini } from "./googleGemini";
import { sendToClaude } from "./anthropicAI";
import { send } from "process";

type GenerationMode = 'single_line' | 'full_script';

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
                // 1. 프롬프트 생성
                const prompt = this.promptEngine.buildPrompt(row, this.history, this.mode);
                const temperature = row.temperature !== undefined ? row.temperature : 0.5;
                let inputText = `you are a story writer who is an expert of Visual Novel style game in scenario. \n
                ${this.history.join("\n")}\n
                Now, generate the next part of the story based on the following details:\n
                ${row.direction}\n
                Please provide the output in the specified format.`;
                
                // 2. 모델 호출
                // row.model이 있으면 사용, 없으면 기본값
                const modelName = row.model?.toLowerCase() || "gemini";
                let rawOutput : any = "";

                switch(modelName) {
                    case "gpt":
                        rawOutput = sendToOpenAI(inputText, prompt, temperature);
                        break;
                    case "claude":
                        rawOutput = sendToClaude(inputText, prompt, temperature);
                        break;
                    case "gemini":
                        rawOutput = sendToGemini(inputText, prompt, temperature);
                        break;
                    default:
                        throw new Error(`Unsupported model: ${modelName}`);
                }
                

                // 3. 모드에 따른 결과 파싱 (핵심)
                if (this.mode === 'full_script') {
                    // [Full Script 모드]
                    // LLM이 여러 줄의 CSV를 뱉음 -> 파싱해서 여러 개의 Result로 변환
                    const parsedLines = this.parseFullScriptCSV(rawOutput);
                    results.push(...parsedLines);
                    
                    // 히스토리에 전체 대화 내용을 요약해서 넣거나, 마지막 대사를 넣음
                    this.history.push(...parsedLines.map(line => line.result));
                    
                } else {
                    // [Single Line 모드] (기존 방식)
                    const cleanText = this.parseSingleLine(rawOutput, row['key']);
                    results.push({ key: row['key'], result: cleanText });
                    this.history.push(`${row['speaker']}: ${cleanText}`);
                }

            } catch (error) {
                console.error(`Error processing row:`, error);
            }
        }
        return results;
    }

    // 기존 방식 파서
    private parseSingleLine(text: string, key: string): string {
        const parts = text.split(",");
        return parts.length >= 2 ? parts.slice(1).join(",").trim() : text.replace(key, "").trim();
    }

    // 신규 방식 파서 (Full Script)
    private parseFullScriptCSV(text: string): StoryResult[] {
        // 예상 포맷: {{sceneId}}, 1, [Speaker], [Emotion], [Content]
        // 줄바꿈으로 분리
        const lines = text.split("\n").filter(line => line.trim() !== "");
        
        return lines.map(line => {
            // CSV 파싱 (쉼표 기준, 따옴표 처리 등은 간소화)
            const parts = line.split(",").map(p => p.trim());
            if (parts.length < 5) return null;

            // sceneId, id, speaker, emotion, content
            const [sceneId, id, speaker, emotion, ...contentParts] = parts;
            const content = contentParts.join(",").trim(); // 내용에 쉼표가 있을 경우 합침

            // Key 생성 전략: SceneId_ID (예: 이로하_스토리_1_1)
            const uniqueKey = `${sceneId}_${String(id).padStart(3, '0')}`;
            
            // 결과 포맷 (원하는 시트 컬럼 구조에 맞춰 JSON 문자열이나 값으로 변환)
            // 여기서는 시트에 'result' 컬럼 하나에 넣기보다는, 
            // 나중에 시트에 row를 추가(Append)할 때 쓸 수 있는 객체 형태로 반환하는 게 좋음.
            // 하지만 기존 인터페이스 유지를 위해 result에 CSV raw data를 넣거나 JSON을 넣음.
            return {
                key: uniqueKey,
                result: content // 혹은 JSON.stringify({ speaker, emotion, content })
            };
        }).filter((item): item is StoryResult => item !== null);
    }
}