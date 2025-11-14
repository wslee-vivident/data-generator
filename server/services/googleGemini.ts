import axios from "axios";

interface GeminiChatResponse {
   candidates : {
    content : {
        parts : {
            text : string;
        }[];
    };
    finishReason? : string;
   }[];
   usageMetadata? : {
    promptTokenCount : number;
    candidateTokenCount : number;
    totalTokenCount : number;
   };
}

export async function sendToGemini(inputText:string, systemPrompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = "gemini-2.5-flash";
    const postUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const body = {
        system_instruction : {
            parts : [
                { text : systemPrompt }
            ]
        },
        contents : [
            {
                role : "user",
                parts : [
                    { text : inputText }
                ]
            }
        ]
    };
    const headers = {
        'Content-Type': 'application/json',
        'x-google-api-key': apiKey,
    };

    try {
        const response = await axios.post<GeminiChatResponse>(postUrl, body, { headers });
        
        const candidate = response.data.candidates?.[0];
        const message = candidate?.content.parts[0].text || "";
        return message.trim();

    } catch (error) {
        console.error("Error communicating with Gemini API:", error);
        throw new Error("Failed to get response from Gemini API");
    }
}