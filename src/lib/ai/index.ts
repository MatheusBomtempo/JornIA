import { env } from "../env";
import { prisma } from "../db";
import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

export type { GenerateInput, GeneratedContent } from "./types";

let cached: AiProvider | null = null;

/** Fábrica do provider de IA conforme AI_PROVIDER. */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  switch (env.ai.provider) {
    case "anthropic":
      cached = new AnthropicProvider();
      break;
    case "mock":
      cached = new MockProvider();
      break;
    // 'openai' pode ser adicionado aqui implementando AiProvider.
    default:
      throw new Error(`AI_PROVIDER desconhecido: ${env.ai.provider}`);
  }
  return cached;
}

/**
 * Pipeline de geração de texto de um post. Carrega o exemplo de estilo
 * (linha única) e chama o provider configurado.
 */
export async function generatePostContent(
  input: Omit<GenerateInput, "style">,
): Promise<GeneratedContent> {
  const style = await prisma.styleReference.findUnique({ where: { id: 1 } });
  const provider = getAiProvider();
  return provider.generate({
    ...input,
    style: style
      ? {
          title: style.exampleTitle,
          shortNews: style.exampleShortNews,
          caption: style.exampleCaption,
          artText: style.exampleArtText,
        }
      : null,
  });
}
