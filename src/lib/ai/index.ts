import { env } from "../env";
import { prisma } from "../db";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { MockProvider } from "./mock";
import { ChainProvider } from "./chain";
import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

export type { GenerateInput, GeneratedContent } from "./types";

let cached: AiProvider | null = null;

/**
 * Monta a corrente de fallback com os provedores que têm chave configurada.
 * Ordem: Groq (rápido, testado) -> OpenRouter (2º elo, com os modelos
 * gratuitos que passaram no teste de formato). NVIDIA fica de fora por
 * padrão — ver o comentário em env.ts sobre por quê.
 */
function buildChain(): AiProvider[] {
  const links: AiProvider[] = [];

  // Timeout curto nos elos gratuitos: um modelo saudável responde em 1-3s;
  // se está demorando mais que isso, é sinal de fila/congestionamento no
  // pool compartilhado gratuito — falhar rápido e cair pro próximo elo é
  // melhor do que ficar esperando até 25s por chamada, várias vezes seguidas.
  const FREE_TIER_TIMEOUT_MS = 15_000;

  if (env.ai.groqKey) {
    links.push(
      new OpenAICompatibleProvider({
        name: "groq",
        baseUrl: env.ai.groqBaseUrl,
        apiKey: env.ai.groqKey,
        model: env.ai.groqModel,
        timeoutMs: FREE_TIER_TIMEOUT_MS,
      }),
    );
  }

  if (env.ai.openrouterKey) {
    for (const model of env.ai.openrouterModels) {
      links.push(
        new OpenAICompatibleProvider({
          name: `openrouter:${model}`,
          baseUrl: env.ai.openrouterBaseUrl,
          apiKey: env.ai.openrouterKey,
          model,
          timeoutMs: FREE_TIER_TIMEOUT_MS,
          extraHeaders: {
            "HTTP-Referer": env.ai.appUrl,
            "X-Title": "JornIA",
          },
        }),
      );
    }
  }

  if (env.ai.nvidiaKey && env.ai.nvidiaModel) {
    // Só entra se você definir NVIDIA_MODEL explicitamente — nenhum modelo
    // ficou pronto pra uso automático nos testes (ver env.ts).
    links.push(
      new OpenAICompatibleProvider({
        name: "nvidia",
        baseUrl: env.ai.nvidiaBaseUrl,
        apiKey: env.ai.nvidiaKey,
        model: env.ai.nvidiaModel,
        timeoutMs: 20_000,
      }),
    );
  }

  if (env.ai.anthropicKey) {
    links.push(new AnthropicProvider());
  }

  return links;
}

/** Fábrica do provider de IA conforme AI_PROVIDER. */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  switch (env.ai.provider) {
    case "chain":
      cached = new ChainProvider(buildChain());
      break;
    case "anthropic":
      cached = new AnthropicProvider();
      break;
    case "openrouter":
      cached = new OpenAICompatibleProvider({
        name: "openrouter",
        baseUrl: env.ai.openrouterBaseUrl,
        apiKey: env.ai.openrouterKey ?? "",
        model: env.ai.model,
        extraHeaders: {
          "HTTP-Referer": env.ai.appUrl,
          "X-Title": "JornIA",
        },
      });
      break;
    case "groq":
      cached = new OpenAICompatibleProvider({
        name: "groq",
        baseUrl: env.ai.groqBaseUrl,
        apiKey: env.ai.groqKey ?? "",
        model: env.ai.model,
      });
      break;
    case "gemini":
      cached = new OpenAICompatibleProvider({
        name: "gemini",
        baseUrl: env.ai.geminiBaseUrl,
        apiKey: env.ai.geminiKey ?? "",
        model: env.ai.model,
      });
      break;
    case "nvidia":
      cached = new OpenAICompatibleProvider({
        name: "nvidia",
        baseUrl: env.ai.nvidiaBaseUrl,
        apiKey: env.ai.nvidiaKey ?? "",
        model: env.ai.nvidiaModel ?? env.ai.model,
      });
      break;
    case "openai":
      cached = new OpenAICompatibleProvider({
        name: "openai",
        baseUrl: env.ai.openaiBaseUrl,
        apiKey: env.ai.openaiKey ?? "",
        model: env.ai.model,
      });
      break;
    case "mock":
      cached = new MockProvider();
      break;
    default:
      throw new Error(
        `AI_PROVIDER desconhecido: "${env.ai.provider}". Use chain, anthropic, groq, gemini, nvidia, openrouter, openai ou mock.`,
      );
  }
  return cached;
}

/**
 * Pipeline de geração de texto de um post. Carrega os exemplos de estilo
 * do jornal e chama o provider configurado.
 *
 * Em modo "chain", a resiliência já vem de trocar de PROVEDOR quando um
 * falha (rate limit, fora do ar, etc.) — não faz sentido retentar a corrente
 * inteira de novo. Em modo de provider único, uma retentativa resolve a
 * maioria das respostas vazias/malformadas dos modelos gratuitos; erro de
 * limite de taxa é a exceção (não adianta insistir na hora).
 */
export async function generatePostContent(
  input: Omit<GenerateInput, "examples">,
): Promise<GeneratedContent> {
  // Poucos exemplos, e cada legenda é cortada em buildUserPrompt — provedores
  // gratuitos cobram por tokens/minuto e um prompt grande pode estourar sozinho.
  const examples = await prisma.styleExample.findMany({
    orderBy: { orderIndex: "asc" },
    take: 3,
    select: { title: true, subtitle: true, caption: true },
  });
  const provider = getAiProvider();
  const fullInput = { ...input, examples };

  if (provider instanceof ChainProvider) {
    return provider.generate(fullInput);
  }

  try {
    return await provider.generate(fullInput);
  } catch (err) {
    if (isRateLimitError(err)) throw err;
    console.warn(
      `[JornIA] IA (${provider.name}) falhou na 1ª tentativa, tentando de novo: ${(err as Error).message}`,
    );
    return await provider.generate(fullInput);
  }
}

function isRateLimitError(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("quota");
}
