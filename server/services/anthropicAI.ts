import Anthropic from '@anthropic-ai/sdk';

export async function sendToClaude(
    inputText: string, 
    systemPrompt : string, 
    temperature:number = 0.5
) : Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if(!apiKey) throw new Error("Anthropic API key is not set in environment variables.");

    let safeTemperature = Number(temperature);
    if(isNaN(safeTemperature) || safeTemperature < 0 || safeTemperature > 1) {
        console.warn(`Invalid temperature value: ${temperature}. Using default 0.5.`);
        safeTemperature = 0.5;
    }

    // Anthropic 클라이언트 초기화
    const anthropic = new Anthropic({
        apiKey : apiKey,
    });

    try {
        const message = await anthropic.messages.create({
            model : "claude-opus-4-5-20251101",
            max_tokens : 4096,
            temperature : safeTemperature,
            system : systemPrompt,
            messages : [
                {
                    role : "user",
                    content : inputText
                }
            ]
        });

        //claude 응답에서 텍스트 추출
        const textBlock = message.content[0];

        if(textBlock.type === "text") {
            return textBlock.text.trim();
        } else {
            console.warn("No text block found in Claude response:", JSON.stringify(message, null, 2));
            throw new Error("No text returned from Claude.");
        }

    } catch (error) {
        console.error("Error communicating with Anthropic:", error);
        throw error;
    }
}

/**
 * Claude JSON 모드 호출
 * systemPrompt에 JSON 출력 지시를 추가하여 구조화된 응답을 받습니다.
 * 파싱 실패시 원본 텍스트를 반환합니다.
 */
export async function sendToClaudeJSON<T>(
    inputText: string,
    systemPrompt: string,
    temperature: number = 0.5
): Promise<T> {
    const jsonSystemPrompt = systemPrompt +
        '\n\n[IMPORTANT] You MUST output ONLY valid JSON. No markdown code fences, no explanation, no extra text. Output raw JSON only.';
    const raw = await sendToClaude(inputText, jsonSystemPrompt, temperature);

    // 코드 펜스 제거 후 파싱
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
        const firstNewline = cleaned.indexOf("\n");
        cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.lastIndexOf("```"));
    }
    return JSON.parse(cleaned.trim());
}