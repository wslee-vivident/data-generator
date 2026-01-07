import { StoryRowData } from '../types';
import { loadPrompt } from '@shared/helpUtil';

export class PromptEngine {
    private mainTemplate : string;
    private dictionary : string;

    constructor (mainTemplateContent : string, dictionaryObj : Record<string, string>) {
        this.mainTemplate = mainTemplateContent;
        // 딕셔너리를 미리 줄바꿈 문자열로 변환
        this.dictionary = Object.entries(dictionaryObj)
            .map(([key, value]) => `${key} : ${value}`)
            .join("\n");
    }

    public buildPrompt(row: StoryRowData, history: string[]): string {
        // 1. 캐릭터별 전용 프롬프트 파일 로드 (예: prompt_character_비앙카.txt)
        // 파일이 없으면 빈 문자열 혹은 기본값 사용
        let charFileName = "";
        if(String(row.level).trim() !== "" && row.level !== null && row.level !== undefined) {
            charFileName = `story_character_${row.speaker}_${row.level}.txt`;
        } else if (String(row.speaker) === "player") {
            charFileName = `story_character_player.txt`;
        } else if (String(row.speaker) === "narration") {
            charFileName = `story_character_narration.txt`;
        } else  {
            charFileName = `Name: ${row.speaker}`;
        }

        const characterProfile = loadPrompt(charFileName); // fallback 없음 (없으면 비워둠)

        // 2. 기본 치환 맵 구성
        const replacements: Record<string, string> = {
            "{{scene_id}}": row.sceneId,
            "{{Location}}": row.location,
            "{{NarrationTone}}": row.narrationTone,
            "{{WritingStyle}}": row.writingStyle,
            "{{IntroContext}}": row.introContext,
            "{{speaker}}": characterProfile,
            "{{emotion}}": row.emotion,
            "{{direction}}": row.direction,
            "{{key}}": row.key,
            "{{oshiz_dictionary}}": this.dictionary
        };

        // 3. Inner Thought 처리
        let innerThoughtText = "None";
        if(row.innerThought) {
            if(typeof row.innerThought === 'object' && Object.keys(row.innerThought).length > 0) {
                // ✅ JSON.stringify를 쓰되, 읽기 좋게 들여쓰기(2칸)를 줍니다.
                innerThoughtText = JSON.stringify(row.innerThought, null, 2);
            } else if (typeof row.innerThought === 'string' && row.innerThought.trim() !== "") {
                innerThoughtText = row.innerThought;
            }
        }
        replacements["{{innerThought}}"] = innerThoughtText;

        // 4. History 처리
        const MAX_HISTORY_LINES = 20;
        const recentHistory = history.slice(-MAX_HISTORY_LINES).join("\n");
        replacements["{{conversation_history}}"] = recentHistory || "(대화 시작)";

        // 5. 템플릿 치환 실행
        let finalPrompt = this.mainTemplate;
        for (const [key, value] of Object.entries(replacements)) {
            const regex = new RegExp(key, "g");
            finalPrompt = finalPrompt.replace(regex, value || "");
        }

        return finalPrompt;
    }
}

