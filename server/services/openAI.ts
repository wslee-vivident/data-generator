import OpenAI from 'openai';
import { api } from 'server';

export async function sendToOpenAI(
    inputText:string, 
    systemPrompt: string,
    temperature: number = 0.5
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) throw new Error("OpenAI API key is not set in environment variables.");

    const openai = new OpenAI({
        apiKey : apiKey, // process.env.OPENAI_API_KEY
    });

    const floatTemperature = parseFloat(temperature.toString());

    try {
        const response = await openai.responses.create({
            model : "gpt-5.1",
            input : [
                { role: "system", content: systemPrompt },
                { role : "user", content : inputText }
            ],
            temperature : floatTemperature,
            reasoning : { effort : "none" },
            max_output_tokens : 4096,
        });

        return response.output_text?.trim() || "";

    } catch (error) {
        console.error("Error communicating with OpenAI:", error);
        throw error;
    }
}

/**
 * OpenAI JSON 모드 호출
 * response_format을 사용하여 구조화된 JSON 응답을 받습니다.
 */
export async function sendToOpenAIJSON<T>(
    inputText: string,
    systemPrompt: string,
    temperature: number = 0.5
): Promise<T> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API key is not set in environment variables.");

    const openai = new OpenAI({ apiKey });
    const floatTemperature = parseFloat(temperature.toString());

    try {
        const response = await openai.responses.create({
            model: "gpt-5.1",
            input: [
                { role: "system", content: systemPrompt },
                { role: "user", content: inputText }
            ],
            temperature: floatTemperature,
            reasoning: { effort: "none" },
            max_output_tokens: 4096,
            text: { format: { type: "json_object" } },
        });

        const raw = response.output_text?.trim() || "{}";
        return JSON.parse(raw);

    } catch (error) {
        console.error("Error communicating with OpenAI (JSON mode):", error);
        throw error;
    }
}

