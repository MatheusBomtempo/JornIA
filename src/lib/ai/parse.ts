import type { GeneratedContent } from "./types";

/**
 * Extrai um objeto JSON de uma resposta de LLM, tolerando cercas de markdown
 * (```json ... ```) e texto ao redor. Lança se não achar JSON válido com os
 * campos esperados.
 */
export function parseGeneratedContent(raw: string): GeneratedContent {
  const cleaned = stripCodeFences(raw).trim();
  const jsonText = extractFirstJsonObject(cleaned) ?? cleaned;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    throw new Error("A IA não retornou um JSON válido.");
  }

  const title = str(obj.title);
  const shortNews = str(obj.shortNews ?? obj.short_news);
  const instagramCaption = str(
    obj.instagramCaption ?? obj.instagram_caption ?? obj.caption,
  );
  const artText = str(obj.artText ?? obj.art_text);

  if (!title || !shortNews) {
    throw new Error("Resposta da IA sem os campos obrigatórios (title/shortNews).");
  }

  return { title, shortNews, instagramCaption, artText };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function stripCodeFences(s: string): string {
  return s.replace(/```(?:json)?/gi, "").replace(/```/g, "");
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
