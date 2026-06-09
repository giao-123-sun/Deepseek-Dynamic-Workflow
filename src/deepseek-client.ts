import type { ChatMessage, DeepSeekChatResponse } from "./types.js";

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  userId: string;
  temperature: number;
}

export class DeepSeekClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  async chat(request: ChatRequest): Promise<DeepSeekChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        user_id: request.userId
      })
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`DeepSeek API error ${response.status}: ${redactApiError(bodyText)}`);
    }

    return JSON.parse(bodyText) as DeepSeekChatResponse;
  }
}

function redactApiError(text: string): string {
  return text.replace(/sk-[a-zA-Z0-9]+/g, "sk-REDACTED");
}
