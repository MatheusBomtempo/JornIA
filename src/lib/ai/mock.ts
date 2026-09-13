import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

/**
 * Provider de desenvolvimento — não chama nenhuma API externa.
 * Útil para rodar o fluxo completo sem chaves de IA configuradas.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async generate(input: GenerateInput): Promise<GeneratedContent> {
    const base =
      input.sourceText?.trim() ||
      input.scrapedContent?.trim() ||
      input.sourceUrl ||
      "Notícia de última hora";
    const snippet = base.split(/\s+/).slice(0, 12).join(" ");

    return {
      title: capitalize(snippet).slice(0, 70) || "Manchete de exemplo",
      shortNews: `${capitalize(snippet)}. Texto gerado em modo de desenvolvimento (mock), sem IA real. Substitua configurando AI_PROVIDER=anthropic.`,
      instagramCaption: `${capitalize(snippet)} 📰\n\nSaiba mais no nosso feed. #jornalismo #noticias`,
      artText: capitalize(snippet).slice(0, 40).toUpperCase(),
    };
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
