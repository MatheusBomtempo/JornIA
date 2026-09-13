import type { SourceType } from "../domain";

/** Exemplo de referência de estilo (linha única de style_reference). */
export interface StyleReferenceExample {
  title?: string | null;
  shortNews?: string | null;
  caption?: string | null;
  artText?: string | null;
}

/** Entrada do pipeline de IA (somente texto — sem visão nem imagem). */
export interface GenerateInput {
  sourceType: SourceType;
  sourceText?: string | null;
  sourceUrl?: string | null;
  /** Texto extraído por scraping quando a fonte é um link. */
  scrapedContent?: string | null;
  region?: string | null;
  style?: StyleReferenceExample | null;
  /** Dica opcional para regeneração ("mais curto", "tom mais sóbrio"...). */
  guidance?: string | null;
}

/** Saída estruturada da IA. */
export interface GeneratedContent {
  title: string;
  shortNews: string;
  instagramCaption: string;
  artText: string;
}

export interface AiProvider {
  readonly name: string;
  generate(input: GenerateInput): Promise<GeneratedContent>;
}
