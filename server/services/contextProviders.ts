import { BaseStoryRow, GenerationMode } from '../types';
import { loadPrompt } from '../../shared/helpUtil';

// =================================================================
//  Context Provider 인터페이스 및 구현체
//  각 Provider는 독립적인 컨텍스트 정보를 담당합니다.
//  새 컨텍스트 추가시 → Provider 클래스 1개 작성 + 등록하면 끝
// =================================================================

/**
 * 컨텍스트 제공자 인터페이스
 * 모든 컨텍스트 모듈은 이 인터페이스를 구현합니다.
 */
export interface ContextProvider {
    /** 이 프로바이더가 해당 row/mode를 처리할 수 있는지 판단 */
    canProvide(row: BaseStoryRow, mode: GenerationMode): boolean;
    /** 템플릿 변수 맵을 반환 (null이면 해당 컨텍스트 미포함) */
    provide(row: BaseStoryRow, history: string[]): Record<string, string>;
}

// =================================================================
//  1. DictionaryProvider - 게임 용어 사전
// =================================================================

export class DictionaryProvider implements ContextProvider {
    private dictionaryText: string;

    constructor(dictionaryObj: Record<string, string>) {
        // 딕셔너리를 미리 줄바꿈 문자열로 변환
        this.dictionaryText = Object.entries(dictionaryObj)
            .map(([key, value]) => `${key} : ${value}`)
            .join("\n");
    }

    canProvide(): boolean {
        return true; // 항상 제공
    }

    provide(): Record<string, string> {
        return {
            "oshiz_dictionary": this.dictionaryText,
        };
    }
}

// =================================================================
//  2. CommonRowProvider - row에서 직접 추출하는 공통 변수
// =================================================================

export class CommonRowProvider implements ContextProvider {
    canProvide(): boolean {
        return true; // 항상 제공
    }

    provide(row: BaseStoryRow): Record<string, string> {
        // innerThought 처리
        let innerThoughtText = "None";
        if (row.innerThought) {
            if (typeof row.innerThought === 'object' && Object.keys(row.innerThought).length > 0) {
                innerThoughtText = JSON.stringify(row.innerThought, null, 2);
            } else if (typeof row.innerThought === 'string' && row.innerThought.trim() !== "") {
                innerThoughtText = row.innerThought;
            }
        }

        return {
            "char": String(row['speaker'] || "").trim(),
            "scene_id": row['sceneId'] || "",
            "key": row['key'] || "",
            "Location": row['location'] || "",
            "direction": row['direction'] || "",
            "model": row['model'] || "",
            "temperature": row['temperature'] !== undefined ? String(row['temperature']) : "",
            "innerThought": innerThoughtText,
        };
    }
}

// =================================================================
//  3. CharacterProfileProvider - 캐릭터 프로필 로딩 (single_line)
// =================================================================

export class CharacterProfileProvider implements ContextProvider {
    canProvide(_row: BaseStoryRow, mode: GenerationMode): boolean {
        return mode === 'single_line';
    }

    provide(row: BaseStoryRow): Record<string, string> {
        const speakerName = String(row['speaker'] || "").trim();
        const level = String(row['level'] || "").trim();

        // 캐릭터 파일명 결정 (기존 로직 캡슐화)
        const charFileName = this.resolveCharacterFile(speakerName, level);
        const content = loadPrompt(charFileName);

        return {
            "speaker": content || `Name: ${speakerName}`,
            "emotion": row['emotion'] || "",
            // 소문자 + PascalCase 모두 제공 (템플릿 호환성)
            "introContext": row['introContext'] || "",
            "IntroContext": row['introContext'] || "",
            "narrationTone": row['narrationTone'] || "",
            "NarrationTone": row['narrationTone'] || "",
            "writingStyle": row['writingStyle'] || "",
            "WritingStyle": row['writingStyle'] || "",
        };
    }

    /**
     * 캐릭터 프로필 파일명 결정
     * - level이 있으면: story_character_{name}_{level}.txt
     * - player이면: story_character_player.txt
     * - narration이면: story_character_narration.txt
     * - 기타: "Name: {speakerName}" (리터럴 텍스트)
     */
    private resolveCharacterFile(speaker: string, level: string): string {
        if (level && level !== "null" && level !== "undefined") {
            return `story_character_${speaker}_${level}.txt`;
        }
        if (speaker === "player" || speaker === "narration") {
            return `story_character_${speaker}.txt`;
        }
        return `Name: ${speaker}`;
    }
}

// =================================================================
//  4. ConversationHistoryProvider - 대화 내역 관리
// =================================================================

export class ConversationHistoryProvider implements ContextProvider {
    private singleLineMax: number;
    private fullScriptMax: number;

    constructor(singleLineMax: number = 20, fullScriptMax: number = 15) {
        this.singleLineMax = singleLineMax;
        this.fullScriptMax = fullScriptMax;
    }

    canProvide(): boolean {
        return true; // 항상 제공
    }

    provide(_row: BaseStoryRow, history: string[]): Record<string, string> {
        // 모드별 히스토리 길이 조절은 두 변수 모두 제공하여 해결
        const singleHistory = history.slice(-this.singleLineMax).join("\n");
        const fullHistory = history.slice(-this.fullScriptMax).join("\n");

        return {
            "conversation_history": singleHistory || "(대화 시작)",
            "script_history": fullHistory || "(대화 시작)",
        };
    }
}

// =================================================================
//  5. FullScriptProfileProvider - 풀 스크립트 모드 전용 컨텍스트
// =================================================================

export class FullScriptProfileProvider implements ContextProvider {
    canProvide(_row: BaseStoryRow, mode: GenerationMode): boolean {
        return mode === 'full_script';
    }

    provide(row: BaseStoryRow): Record<string, string> {
        const charName = String(row['character'] || "").trim();
        const level = String(row['level'] || "");

        // 히로인 프로필 로드
        let heroineProfile = "";
        if (charName) {
            heroineProfile = loadPrompt(`story_character_${charName}_${level}.txt`);
        }

        // 플레이어 프로필 로드
        const playerProfile = loadPrompt(`story_character_player.txt`);

        // 시스템 모드 프로필 로드
        const systemKind = String(row['systemKind'] || "").trim();
        let systemPrompt = "";
        if (systemKind) {
            systemPrompt = loadPrompt(`story_system_${systemKind}.txt`);
        }

        return {
            "player_info": playerProfile,
            "character_info": heroineProfile,
            "place": row['place'] || "",
            "systemKind": systemPrompt,
            // nunjucks {% if %} 블록에 필요한 변수들
            "systemMode": systemKind || "story",
            "character": row['speaker'] || row['character'] || "Player",
            "heroine": charName || "",
        };
    }
}

// =================================================================
//  확장 예시 (필요시 새 Provider 추가)
// =================================================================

// export class WeatherProvider implements ContextProvider { ... }
// export class InventoryProvider implements ContextProvider { ... }
// export class QuestStateProvider implements ContextProvider { ... }
