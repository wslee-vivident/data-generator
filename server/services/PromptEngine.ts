import { BaseStoryRow } from '../types';
import { loadPrompt } from '../../shared/helpUtil';

export type GenerationMode = 'single_line' | 'full_script';

export class PromptEngine {
    private mainTemplate : string;
    private dictionary : string;

    constructor (mainTemplateContent : string, 
        dictionaryObj : Record<string, string>
    ) {
        this.mainTemplate = mainTemplateContent;
        // 딕셔너리를 미리 줄바꿈 문자열로 변환
        this.dictionary = Object.entries(dictionaryObj)
            .map(([key, value]) => `${key} : ${value}`)
            .join("\n");
    }


    //모드에 따라 적절한 컨텍스트를 준비하고 프롬프트를 생성합니다.
    public buildPrompt(row: BaseStoryRow, history: string[], mode: GenerationMode): string {

        const commonReplacements : Record<string, string> = {
            "{{oshiz_dictionary}}" : this.dictionary,
            "{{scene_id}}" : row['sceneId'] || "",
            "{{key}}" : row['key'] || "",
            "{{Location}}" : row['location'] || "",
            "{{direction}}" : row['direction'] || "",
            "{{model}}" : row['model'] || "",
            "{{temperature}}" : row['temperature'] !== undefined ? String(row['temperature']) : "",
        };

        let specificReplacements : Record<string, string> = {};

        if(mode === 'single_line') {
            specificReplacements = this.prepareSingleLineContext(row, history);
        } else if (mode === 'full_script') {
            specificReplacements = this.prepareFullStoryContext(row, history);
        }

        //데이터 병합
        const finalReplacements = { ...commonReplacements, ...specificReplacements };
        

        // 3. Inner Thought 처리
        let innerThoughtText = "None";
        if(row.innerThought) {
            if(typeof row.innerThought === 'object' && Object.keys(row.innerThought).length > 0) {
                // ✅ JSON.stringify를 쓰되, 읽기 좋게 들여쓰기(2칸)를 줍니다.
                innerThoughtText = JSON.stringify(row.innerThought, null, 2);
            } else if (typeof row.innerThought === 'string' && row.innerThought.trim() !== "") {
                innerThoughtText = row.innerThought;
            }
            finalReplacements["{{innerThought}}"] = innerThoughtText;
        }

        // 5. 템플릿 치환 실행
        let finalPrompt = this.mainTemplate;
        for (const [key, value] of Object.entries(finalReplacements)) {
            const regex = new RegExp(key, "g");
            finalPrompt = finalPrompt.replace(regex, value || "");
        }

        return finalPrompt;
    }

    // =================================================================
    //  Private Helper Methods (Context Providers)
    // =================================================================

    private prepareSingleLineContext(row : BaseStoryRow, history : string[]) : Record<string, string> {
        const speakerName = row['speaker'] || "";
        const level = String(row['level'] || "");
        const MAX_HISTORY_LINES = 20;
        const recentHistory = history.slice(-MAX_HISTORY_LINES).join("\n");

        const characterProfile = this.loadSpeakerProfile(speakerName, level);

        return {
            "{{speaker}}" : characterProfile,
            "{{conversation_history}}" : recentHistory || "(대화 시작)",
            "{{emotion}}" : row['emotion'] || "",
            "{{introContext}}" : row['direction'] || "",
            "{{narrationTone}}" : row['narrationTone'] || "",
            "{{writingStyle}}" : row['writingStyle'] || ""
        }
    }

    private prepareFullStoryContext(row : BaseStoryRow, history : string[]) : Record<string, string> {
        const charName = row['character'] || "";
        const level = String(row['level'] || "");

        let heroineProfile = "";
        if(charName) {
            heroineProfile = loadPrompt(`story_character_${charName}_${level}.txt`);
        }

        const playerProfile = loadPrompt(`story_character_player.txt`);
        const systemKind = row['systemKind'] || "";
        let systemPrompt = "";
        if(systemKind) {
            systemPrompt = loadPrompt(`story_system_${systemKind}.txt`);
        }

        const MAX_HISTORY_LINES = 15;
        const recentHistory = history.slice(-MAX_HISTORY_LINES).join("\n");

        return {
            "{{player_info}}" : playerProfile,
            "{{character_info}}" : heroineProfile,
            "{{place}}" : row['place'] || "",
            "{{systemKind}}" : systemPrompt,
            "{{script_history}}" : recentHistory || "(대화 시작)",
        }
    }

    private loadSpeakerProfile(speaker : string, level?: string | number) : string {
        if(!speaker) return "";

        let fileName = "";
        const cleanSpeaker = String(speaker).trim();

        if(String(level).trim() !== "" && level !== null && level !== undefined) {
            fileName = `story_character_${cleanSpeaker}_${level}.txt`;
        } else if (String(cleanSpeaker) === "player") {
            fileName = `story_character_player.txt`;
        } else if (String(cleanSpeaker) === "narration") {
            fileName = `story_character_narration.txt`;
        } else  {
            fileName = `Name: ${cleanSpeaker}`;
        }

        // 파일 로드 시도
        return loadPrompt(fileName);
    }
}

