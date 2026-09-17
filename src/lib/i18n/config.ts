/**
 * Idioma da INTERFACE apenas. Nunca deve ser lido pelo pipeline de IA
 * (src/lib/ai/*) — o texto do post é sempre redigido em português, não
 * importa em que idioma a pessoa está navegando o produto.
 */
export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Sem sinal nenhum (sem cookie, sem geo, sem Accept-Language), cai em inglês
 * — só português é tratado como caso especial (Brasil), ver detect.ts.
 */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
