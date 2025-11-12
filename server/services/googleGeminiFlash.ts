import axios from "axios";

interface GeminiGenerateResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

export async function sendToGemini(
  inputText: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        // role 개념이 OpenAI와 다르므로, 시스템 메시지는 별도 처리할 수 있습니다
        parts: [
          { text: systemPrompt },
          { text: inputText }
        ],
        role: "user" // 혹은 문서에 맞게 role 설정
      }
    ],
    model: "gemini-2.5-flash",
    // thinking_budget 같은 Gemini 특화 옵션이 있다면 추가
    thinking_config: {
      thinking_budget: 2048
    },
    temperature: 0.3,
    max_output_tokens: 2048
  };

  const response = await axios.post<GeminiGenerateResponse>(
    url,
    body,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    }
  );

  const text = response.data.candidates?.[0]?.content.parts?.[0]?.text || "";
  return text.trim();
}
