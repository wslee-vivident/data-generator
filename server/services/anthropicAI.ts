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