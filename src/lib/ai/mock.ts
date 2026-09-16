import { formatCredit } from "../domain";
import { TITLE_MAX, SUBTITLE_MAX } from "../render/slots";
import type { AiProvider, GenerateInput, GeneratedContent } from "./types";

/**
 * Provider de desenvolvimento — não chama nenhuma API externa.
 * Útil para rodar o fluxo completo sem chaves de IA configuradas.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async generate(input: GenerateInput): Promise<GeneratedContent> {
    const base =
      input.text?.trim() ||
      input.scrapedContent?.trim() ||
      input.sourceUrl ||
      "Notícia de última hora";
    const snippet = capitalize(base.split(/\s+/).slice(0, 10).join(" "));

    const credits = (input.credits ?? []).map(formatCredit).filter(Boolean);

    return {
      title: snippet.slice(0, TITLE_MAX),
      subtitle: `Detalhe gerado em modo de desenvolvimento, sem IA real.`.slice(
        0,
        SUBTITLE_MAX,
      ),
      instagramCaption: [
        snippet + ".",
        "",
        "Texto gerado em modo de desenvolvimento (mock). Configure AI_PROVIDER para usar IA de verdade.",
        ...(credits.length ? ["", ...credits] : []),
        "",
        "#JornAI #Teste",
      ].join("\n"),
      imageSuggestions: ["foto genérica notícia", "cena mock desenvolvimento"],
      meta: { provider: this.name, model: "mock" },
    };
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
