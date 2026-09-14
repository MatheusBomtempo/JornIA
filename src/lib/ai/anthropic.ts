import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { parseGeneratedContent } from "./parse";
import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

/** Provider de texto usando a API da Anthropic (Claude). */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    if (!env.ai.anthropicKey) {
      throw new Error(
        "ANTHROPIC_API_KEY ausente. Configure ou use AI_PROVIDER=mock em dev.",
      );
    }
    this.client = new Anthropic({ apiKey: env.ai.anthropicKey });
  }

  async generate(input: GenerateInput): Promise<GeneratedContent> {
    const msg = await this.client.messages.create({
      model: env.ai.model,
      // Legendas de 3-5 parágrafos + créditos + hashtags podem passar de
      // 1024 tokens e cortar no meio da frase — dá folga.
      max_tokens: 1600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return { ...parseGeneratedContent(text), meta: { provider: this.name, model: env.ai.model } };
  }
}
