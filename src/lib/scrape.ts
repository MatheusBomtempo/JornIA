import "server-only";
import * as cheerio from "cheerio";

/**
 * Extrai título + texto principal de um link (source_type = 'link'),
 * para servir de fonte factual ao pipeline de IA. Heurística simples:
 * remove scripts/estilos/nav e concatena parágrafos.
 */
export async function scrapeUrl(url: string): Promise<{
  title: string;
  content: string;
}> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; JornAI/0.1; +https://github.com/)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Não foi possível acessar o link (HTTP ${res.status}).`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, nav, header, footer, aside, form").remove();

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    "";

  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    "";

  const paragraphs: string[] = [];
  $("article p, main p, p").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 40) paragraphs.push(text);
  });

  // Dedup preservando ordem, e corta em ~10k chars.
  const seen = new Set<string>();
  const body = paragraphs
    .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
    .join("\n\n")
    .slice(0, 10000);

  const content = [description, body].filter(Boolean).join("\n\n");

  if (!content.trim()) {
    throw new Error(
      "Não foi possível extrair texto do link (página vazia ou protegida).",
    );
  }

  return { title, content };
}
