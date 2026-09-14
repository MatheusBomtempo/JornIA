import type { Credit } from "../domain";

/** Um exemplo real de post do jornal, usado como referência de estilo. */
export interface StyleExampleInput {
  title?: string | null;
  subtitle?: string | null;
  caption?: string | null;
}

/**
 * Entrada do pipeline de IA (somente texto — sem visão nem geração de imagem).
 * A captura é unificada: o jornalista manda o que tem e a IA infere o contexto
 * (editoria, tom, região) sozinha.
 */
export interface GenerateInput {
  /** Texto apurado/colado pelo jornalista. */
  text?: string | null;
  /** Link de origem, quando a fonte foi uma URL. */
  sourceUrl?: string | null;
  /** Material de apoio: conteúdo do link e/ou documento anexado (PDF). */
  scrapedContent?: string | null;
  /** Se o post tem foto. */
  hasPhoto?: boolean;
  /** Créditos/marcações que devem entrar no fim da legenda. */
  credits?: Credit[] | null;
  /** Exemplos de estilo do jornal. */
  examples?: StyleExampleInput[] | null;
  /** Ajuste pedido na regeneração ("mais curto", "tom mais sóbrio"…). */
  guidance?: string | null;
}

/** Saída estruturada da IA. */
export interface GeneratedContent {
  /** Título da arte — máx. 69 caracteres. */
  title: string;
  /** Subtítulo da arte — máx. 149 caracteres. */
  subtitle: string;
  /** Legenda completa do Instagram (com hashtags). */
  instagramCaption: string;
  /**
   * Quem gerou de fato — importante com fallback entre provedores: o post
   * pode ter sido escrito pelo provider principal ou por um dos backups.
   */
  meta?: { provider: string; model: string };
}

export interface AiProvider {
  readonly name: string;
  generate(input: GenerateInput): Promise<GeneratedContent>;
}
