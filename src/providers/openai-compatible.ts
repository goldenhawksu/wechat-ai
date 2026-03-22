import { createLogger } from "../logger.js";
import type { Provider, ProviderOptions, ProviderConfig } from "../types.js";

const log = createLogger("openai-compat");

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAICompatibleProvider implements Provider {
  readonly name: string;
  private config: ProviderConfig;
  private histories = new Map<string, ChatMessage[]>();

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = config;
  }

  async query(
    prompt: string,
    sessionId: string,
    options?: ProviderOptions,
  ): Promise<string> {
    const baseUrl = this.config.baseUrl;
    const apiKey = this.config.apiKey || process.env[this.config.apiKeyEnv as string || ""];
    const model = options?.model || (this.config.model as string);

    if (!baseUrl) throw new Error(`${this.name}: baseUrl is required`);
    if (!apiKey) throw new Error(`${this.name}: apiKey is required`);
    if (!model) throw new Error(`${this.name}: model is required`);

    // Build conversation history
    let history = this.histories.get(sessionId);
    if (!history) {
      history = [];
      this.histories.set(sessionId, history);
    }

    const messages: ChatMessage[] = [];

    // System prompt
    const systemPrompt = options?.systemPrompt || (this.config.systemPrompt as string);
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    // Conversation history (keep last N turns to stay within context)
    const maxHistory = (this.config.maxHistory as number) || 20;
    const recentHistory = history.slice(-maxHistory);
    messages.push(...recentHistory);

    // Current user message
    messages.push({ role: "user", content: prompt });

    log.info(`Querying ${this.name} (model: ${model}, session: ${sessionId.slice(0, 8)}...)`);

    const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens || (this.config.maxTokens as number) || 4096,
        temperature: (this.config.temperature as number) ?? 0.7,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      log.error(`${this.name} API error ${res.status}: ${errBody.slice(0, 200)}`);
      throw new Error(`${this.name} API error: ${res.status}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const reply = data.choices[0]?.message.content || "(No response)";

    if (data.usage) {
      log.info(`Tokens: ${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out`);
    }

    // Update history
    history.push({ role: "user", content: prompt });
    history.push({ role: "assistant", content: reply });

    log.info(`Response: ${reply.length} chars`);
    return reply;
  }
}
