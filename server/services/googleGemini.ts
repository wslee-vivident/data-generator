import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export async function sendToGemini(inputText : string, systemPrompt: string) : Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if(!apiKey) throw new Error('Gemini API key is not set in environment variables.');

    const genAI = new GoogleGenAI({apiKey});

    try {
        const result = await genAI.models.generateContent({
            model : "gemini-3-flash-preview",
            config : {
                temperature : 0.5,
                systemInstruction : {
                    parts : [{text : systemPrompt}]
                },
                thinkingConfig : {
                    thinkingLevel : ThinkingLevel.MINIMAL,
                    includeThoughts : false
                }
            },
            contents : [
                {
                    role : "user",
                    parts : [{ text : inputText }]
                }
            ]
        });

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if(!text) {
            console.warn('No text generated. Full result:', JSON.stringify(result, null, 2));
            throw new Error('No text returned from Gemini.');
        }

        return text.trim();

    } catch (error) {
        console.error('Error communicating with Gemini:', error);
        throw error;
    }
}