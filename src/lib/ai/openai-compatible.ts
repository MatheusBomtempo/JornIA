import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import { parseGeneratedContent } from "./parse";
import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

export interface OpenAICompatibleConfig {
  name: string;
  baseUrl: string; // ex.: https://openrouter.ai/api/v1
  apiKey: string;
  model: string;
  /** Cabeçalhos extras (OpenRouter recomenda HTTP-Referer e X-Title). */
  extraHeaders?: Record<string, string>;
  /**
   * Timeout da chamada, em ms (padrão 25s). Importante quando este provider
   * faz parte de uma corrente de fallback: alguns modelos "raciocinadores"
   * (ex.: gpt-oss, glm) podem levar minutos ou nunca terminar — sem timeout,
   * eles travariam a corrente inteira em vez de passar pro próximo.
   */
  timeoutMs?: number;
}

/**
 * Provider de texto para qualquer API compatível com o formato de
 * chat completions da OpenAI — inclui OpenRouter, OpenAI e a maioria dos
 * gateways. O prompt já pede JSON estrito; o parser tolera variações.
 */
export class OpenAICompatibleProvider implements AiProvider {
  readonly name: string;
  private cfg: OpenAICompatibleConfig;

  constructor(cfg: OpenAICompatibleConfig) {
    if (!cfg.apiKey) {
      throw new Error(
        `${cfg.name}: chave de API ausente. Configure a variável de ambiente correspondente.`,
      );
    }
    this.name = cfg.name;
    this.cfg = cfg;
  }

  async generate(input: GenerateInput): Promise<GeneratedContent> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.cfg.timeoutMs ?? 25_000,
    );

    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "Content-Type": "application/json",
          ...this.cfg.extraHeaders,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: 0.4,
          // Legendas de 3-5 parágrafos + créditos + hashtags podem passar de
          // 1024 tokens e cortar no meio da frase — dá folga.
          max_tokens: 1600,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(input) },
          ],
        }),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`${this.cfg.name}: tempo esgotado (modelo demorou demais a responder).`);
      }
      throw new Error(`${this.cfg.name}: falha de conexão (${(err as Error).message}).`);
    } finally {
      clearTimeout(timeout);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (data as { error?: { message?: string } })?.error?.message ??
        `HTTP ${res.status}`;
      throw new Error(`${this.cfg.name}: ${msg}`);
    }

    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      // Alguns modelos "raciocinadores" só preenchem reasoning_content e
      // deixam content vazio/nulo — sem resposta final utilizável.
      throw new Error(`${this.cfg.name}: resposta sem conteúdo de texto.`);
    }
    return {
      ...parseGeneratedContent(content),
      meta: { provider: this.name, model: this.cfg.model },
    };
  }
}
