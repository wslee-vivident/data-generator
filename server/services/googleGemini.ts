import { GoogleGenerativeAI } from "@google/generative-ai";

export async function sendToGemini(inputText : string, systemPrompt: string) : Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if(!apiKey) throw new Error('Gemini API key is not set in environment variables.');

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
        model : 'gemini-2.5-flash',
        systemInstruction : systemPrompt
    });

    try {
        const result = await model.generateContent(inputText);

        const response = await result.response;
        const text = response.text();

        return text.trim();
    } catch (error) {
        console.error('Error communicating with Gemini:', error);
        throw error;
    }
}