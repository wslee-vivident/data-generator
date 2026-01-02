import OpenAI from 'openai';
import { api } from 'server';

export async function sendToOpenAI(inputText:string, systemPrompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) throw new Error("OpenAI API key is not set in environment variables.");

    const openai = new OpenAI({
        apiKey : apiKey, // process.env.OPENAI_API_KEY
    });

    try {
        const response = await openai.responses.create({
            model : "gpt-5.1",
            input : [
                { role: "system", content: systemPrompt },
                { role : "user", content : inputText }
            ],
            temperature : 0.5,
            reasoning : { effort : "none" },
            max_output_tokens : 4096,
        });

        return response.output_text?.trim() || "";

    } catch (error) {
        console.error("Error communicating with OpenAI:", error);
        throw error;
    }
}