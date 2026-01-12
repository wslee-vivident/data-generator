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
                Now, generate the next part of the story based on the prompt.`;
                
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
                    const historyLines = parsedLines.map(line => `${line['speaker']} : ${line['text']}`);
                    this.history.push(...historyLines);
                    
                } else {
                    // [Single Line 모드] (기존 방식)
                    const cleanText = this.parseSingleLine(rawOutput, row['key']);
                    results.push({ 
                        key: row['key'], 
                        result: cleanText 
                    });
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
        // 1. 입력값 안전 검증
        if (!text) {
            console.warn("⚠️ parseFullScriptCSV received empty input.");
            return [];
        }

        let rawString = "";
        
        // LLM이 JSON 객체로 반환했을 경우 처리
        if (typeof text === 'object') {
            rawString = text.content || text.result || JSON.stringify(text);
        } else {
            rawString = String(text);
        }

        // 2. 줄바꿈으로 분리
        const lines = rawString.split("\n").filter(line => line.trim() !== "");
        
        return lines.map(line => {
            // [중요] 구분자를 파이프(|)로 변경하여 쉼표 대사 문제 해결
            const parts = line.split("|").map(p => p.trim());
            
            // 데이터가 충분하지 않으면 스킵 (빈 줄 방지)
            // 프롬프트에서 항상 7개 컬럼을 요구했으므로 최소 5개 이상 확인
            if (parts.length < 5) return null;

            // 포맷: {{sceneId}} | id | speaker | emotion | text | choice_grade | reply_text
            // 배열 구조 분해 할당
            const [sceneId, id, speaker, emotion, textContent, choiceGrade, replyText] = parts;

            // Key 생성: SceneId_001 형태
            // id가 숫자인지 확인 후 패딩 처리
            const safeId = isNaN(Number(id)) ? id : String(id).padStart(3, '0');
            const uniqueKey = `${sceneId}_${safeId}`;
            
            // 3. 반환 데이터 구성 
            // 시트 헤더 이름과 정확히 일치하는 키값으로 객체를 만들어야 updateSheetData에서 자동 매핑됨
            return {
                // 시스템 식별용
                key: uniqueKey,      
                
                // 시트 컬럼 매핑용
                sceneId: sceneId,
                speaker: speaker,
                emotion: emotion,
                text: textContent,              // 시트 헤더: text
                choice_grade: choiceGrade || "", // 시트 헤더: choice_grade (없으면 빈값)
                reply_text: replyText || "",     // 시트 헤더: reply_text (없으면 빈값)
                
                // 기존 로직 호환용 (혹시 result 컬럼을 쓰는 곳이 있다면)
                result: textContent, 
                
            } as any; 

        }).filter((item): item is StoryResult => item !== null);
    }
}