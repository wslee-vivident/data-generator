import axios from "axios";

interface GeminiChatResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

export async function sendToGemini(inputText:string, systemPrompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;

    const response = await axios.post<GeminiChatResponse>(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
            // --- Body 영역 (데이터) ---
            systemInstruction: {
                parts: [ { text: systemPrompt } ]
            },
            contents: [
                {
                    role: "user",
                    parts: [ { text: inputText } ]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048
            }
        },
        {
            // --- Header 영역 (인증) ---
            headers: {
                "Content-Type": "application/json",
                // "Authorization": `Bearer ${apiKey}` (X) -> 이렇게 쓰지 마세요
                "x-goog-api-key": apiKey // (O) -> 이 헤더를 사용합니다
            }
        }
    );

    const message = response.data.choices?.[0]?.message?.content || "";
    return message.trim();
}