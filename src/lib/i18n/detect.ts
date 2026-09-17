import type { Locale } from "./config";

/**
 * Geo (header `x-vercel-ip-country`, só existe em deploy na Vercel):
 * Brasil -> pt; qualquer outro país (EUA, Europa, etc.) -> en. É o pedido
 * do dono: inglês no IP americano/europeu, português só no Brasil.
 */
export function localeFromCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return country.trim().toUpperCase() === "BR" ? "pt" : "en";
}

/**
 * Fallback pra quando não há geo (localhost, preview sem Vercel): usa o
 * idioma do navegador. Só português entra como "pt" — o resto vira inglês.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim().toLowerCase();
  if (!first) return null;
  return first.startsWith("pt") ? "pt" : "en";
}
