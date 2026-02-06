import { StoryResult } from '../types';

// =================================================================
//  출력 파싱 모듈
//  StoryOrchestrator에서 분리된 파싱 로직 + JSON 파서 추가
//  기존 CSV/Pipe 파서는 하위 호환을 위해 그대로 유지합니다.
// =================================================================

/**
 * [Single Line 모드] 텍스트 파서 (기존 방식)
 * LLM 응답에서 key 이후의 텍스트를 추출합니다.
 * 형식: "key, 대사 내용" → "대사 내용"
 */
export function parseSingleLineText(text: any, key: string): string {
    if (!text) return "";

    const safeText = typeof text === 'string' ? text : String(text);

    const parts = safeText.split(",");
    if (parts.length >= 2) {
        // 첫 번째 쉼표 이후의 모든 텍스트를 합침 (대사에 쉼표 포함 가능성)
        return parts.slice(1).join(",").trim();
    }
    return safeText.replace(key, "").trim();
}

/**
 * [Full Script 모드] 파이프(PSV) 파서 (기존 방식)
 * LLM이 파이프로 구분된 여러 줄의 텍스트를 뱉으면 파싱합니다.
 * 형식: "id | speaker | emotion | text | choice_grade | reply_text"
 */
export function parseFullScriptPSV(text: any, inputSceneId: string): StoryResult[] {
    // 입력값 안전 검증
    if (!text) {
        console.warn("⚠️ parseFullScriptPSV: 빈 입력값");
        return [];
    }

    let rawString = "";

    // LLM이 JSON 객체로 반환했을 경우 처리
    if (typeof text === 'object') {
        rawString = text.content || text.result || JSON.stringify(text);
    } else {
        rawString = String(text);
    }

    // 줄바꿈으로 분리
    const lines = rawString.split("\n").filter(line => line.trim() !== "");

    return lines.map(line => {
        // 구분자: 파이프(|)
        const parts = line.split("|").map(p => p.trim());

        // 최소 5개 컬럼 이상이어야 유효
        if (parts.length < 5) return null;

        // 포맷: id | speaker | emotion | text | choice_grade | reply_text
        const [id, speaker, emotion, textContent, choiceGrade, replyText] = parts;

        // Key 생성: SceneId_001 형태
        const safeId = isNaN(Number(id)) ? id : String(id).padStart(3, '0');
        const uniqueKey = `${inputSceneId}_${safeId}`;

        return {
            sceneId: inputSceneId,
            key: uniqueKey,
            speaker: speaker,
            emotion: emotion,
            text: textContent,
            choice_grade: choiceGrade || "",
            reply_text: replyText || ""
        } as any;

    }).filter((item): item is StoryResult => item !== null);
}

// =================================================================
//  JSON 파서 (신규 - Structured Output용)
// =================================================================

/**
 * JSON 응답에서 코드 펜스를 제거하는 유틸리티
 * LLM이 ```json ... ``` 형태로 응답할 수 있음
 */
export function cleanJsonResponse(raw: string): string {
    let cleaned = raw.trim();
    // ```json 또는 ``` 블록 제거
    if (cleaned.startsWith("```")) {
        const firstNewline = cleaned.indexOf("\n");
        cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.lastIndexOf("```"));
    }
    return cleaned.trim();
}

/**
 * [Single Line 모드] JSON 파서
 * JSON 형태: { "key": "xxx", "text": "대사 내용" }
 */
export function parseSingleLineJSON(jsonText: string, key: string): string {
    try {
        const cleaned = cleanJsonResponse(jsonText);
        const parsed = JSON.parse(cleaned);
        return parsed.text || parsed.result || "";
    } catch (e) {
        console.warn(`⚠️ JSON 파싱 실패, 텍스트 파서로 fallback: ${e}`);
        return parseSingleLineText(jsonText, key);
    }
}

/**
 * [Full Script 모드] JSON 파서
 * JSON 형태: { "lines": [{ "id": 1, "speaker": "...", "emotion": "...", "text": "...", "choice_grade": "", "reply_text": "" }] }
 */
export function parseFullScriptJSON(jsonText: string, inputSceneId: string): StoryResult[] {
    try {
        const cleaned = cleanJsonResponse(jsonText);
        const parsed = JSON.parse(cleaned);
        const lines = Array.isArray(parsed) ? parsed : (parsed.lines || parsed.data || []);

        return lines.map((line: any) => {
            const id = String(line.id || line.key_id || "0");
            const safeId = isNaN(Number(id)) ? id : String(id).padStart(3, '0');
            const uniqueKey = `${inputSceneId}_${safeId}`;

            return {
                sceneId: inputSceneId,
                key: uniqueKey,
                speaker: line.speaker || "",
                emotion: line.emotion || "",
                text: line.text || "",
                choice_grade: line.choice_grade || "",
                reply_text: line.reply_text || "",
            } as any;
        }).filter((item: any): item is StoryResult => item !== null);
    } catch (e) {
        console.warn(`⚠️ JSON 파싱 실패, PSV 파서로 fallback: ${e}`);
        return parseFullScriptPSV(jsonText, inputSceneId);
    }
}
