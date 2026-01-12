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
                let rawOutput = "";

                switch(modelName) {
                    case "gpt":
                        rawOutput = await sendToOpenAI(inputText, prompt, temperature);
                        break;
                    case "claude":
                        rawOutput = await sendToClaude(inputText, prompt, temperature);
                        break;
                    case "gemini":
                        rawOutput = await sendToGemini(inputText, prompt, temperature);
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
    private parseSingleLine(text: any, key: string): string {
        // 1. 입력값 검증: 문자열이 아니면 강제로 변환하거나 빈 문자열 처리
        if (!text) return "";
        
        const safeText = typeof text === 'string' ? text : String(text);

        const parts = safeText.split(",");
        return parts.length >= 2 ? parts.slice(1).join(",").trim() : safeText.replace(key, "").trim();
    }

    // 신규 방식 파서 (Full Script) - 안전 장치 및 컬럼 매핑 강화
    private parseFullScriptCSV(text: any): StoryResult[] {
        // 1. 입력값 안전 검증 (split 에러 방지)
        if (!text) {
            console.warn("⚠️ parseFullScriptCSV received empty input.");
            return [];
        }

        let rawString = "";
        
        // 만약 LLM이 JSON 객체로 반환했을 경우 처리
        if (typeof text === 'object') {
            // content나 result 필드가 있는지 확인해보고, 없으면 stringify
            rawString = text.content || text.result || JSON.stringify(text);
        } else {
            rawString = String(text);
        }

        // 2. 줄바꿈으로 분리
        const lines = rawString.split("\n").filter(line => line.trim() !== "");
        
        return lines.map(line => {
            // CSV 파싱 (쉼표 기준)
            const parts = line.split(",").map(p => p.trim());
            
            // 데이터가 충분하지 않으면 스킵 (헤더나 빈 줄 등)
            if (parts.length < 5) return null;

            // 포맷: {{sceneId}}, id, [Speaker], [Emotion], [Content]
            const [sceneId, id, speaker, emotion, ...contentParts] = parts;
            const content = contentParts.join(",").trim(); // 내용에 쉼표가 섞여있을 수 있으므로 합침

            // Key 생성: SceneId_001 형태 (패딩 추가하여 정렬 용이하게)
            // id가 숫자가 아니라면 그대로 사용
            const safeId = isNaN(Number(id)) ? id : String(id).padStart(3, '0');
            const uniqueKey = `${sceneId}_${safeId}`;
            
            // 3. 반환 데이터 구성 (Sheet 컬럼과 일치시키는 것이 중요)
            // types.ts의 StoryResult에 확장 필드가 필요하거나, any로 처리
            return {
                key: uniqueKey,
                result: content,    // 최종 대사
                
                // [중요] Full Script 모드에서는 아래 필드들이 시트에 같이 업데이트되어야 함
                // replaceSceneResultsInMemory 함수에서 ...item으로 풀어서 쓸 수 있도록 추가
                sceneId: sceneId,
                speaker: speaker,
                emotion: emotion,
                direction: content, // 보통 result와 direction을 같이 씀 (또는 구분)
                
                // 기타 필요한 메타데이터
                model: "AI_Generated", 
            } as any; // StoryResult 인터페이스가 엄격하다면 as any 혹은 인터페이스 확장 필요

        }).filter((item): item is StoryResult => item !== null);
    }
}