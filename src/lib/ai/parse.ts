import { TITLE_MAX, SUBTITLE_MAX } from "../render/slots";
import type { GeneratedContent } from "./types";

/**
 * Lê a resposta do modelo. O formato principal é delimitado por marcadores
 * ([TITULO]/[SUBTITULO]/[LEGENDA]) porque a legenda tem vários parágrafos —
 * texto longo com quebras de linha faz muitos modelos produzirem JSON inválido.
 * JSON continua aceito como alternativa, para compatibilidade.
 */
export function parseGeneratedContent(raw: string): GeneratedContent {
  const cleaned = stripCodeFences(raw).trim();

  const result = parseDelimited(cleaned) ?? parseJson(cleaned);
  if (!result) {
    throw new Error(
      `A IA respondeu num formato inesperado. Início da resposta: "${cleaned.slice(0, 160)}…"`,
    );
  }

  const { title, subtitle, instagramCaption } = result;
  if (!title || !instagramCaption) {
    throw new Error(
      "Resposta da IA incompleta (faltou o título ou a legenda). Tente gerar de novo.",
    );
  }

  return {
    // Rede de segurança: o limite de caracteres é do layout da arte.
    title: clip(title, TITLE_MAX),
    subtitle: clip(subtitle, SUBTITLE_MAX),
    instagramCaption,
  };
}

// ── Formato delimitado (principal) ───────────────────────────
function parseDelimited(s: string): GeneratedContent | null {
  const re =
    /\[\s*T[ÍI]TULO\s*\]([\s\S]*?)\[\s*SUBT[ÍI]TULO\s*\]([\s\S]*?)\[\s*LEGENDA\s*\]([\s\S]*)$/i;
  const m = s.match(re);
  if (!m) return null;
  return {
    title: clean(m[1]),
    subtitle: clean(m[2]),
    instagramCaption: clean(m[3]),
  };
}

/** Remove parênteses de instrução que alguns modelos copiam do template. */
function clean(v: string): string {
  return v
    .trim()
    .replace(/^\((?:máx|max)[^)]*\)\s*/i, "")
    .trim();
}

// ── JSON (alternativa) ───────────────────────────────────────
function parseJson(s: string): GeneratedContent | null {
  const jsonText = extractFirstJsonObject(s);
  if (!jsonText) return null;

  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    // Modelos frequentemente deixam quebras de linha cruas dentro das strings.
    try {
      obj = JSON.parse(escapeRawNewlinesInStrings(jsonText));
    } catch {
      return null;
    }
  }
  if (!obj) return null;

  return {
    title: str(obj.title),
    subtitle: str(obj.subtitle ?? obj.subTitle),
    instagramCaption: str(
      obj.instagramCaption ?? obj.instagram_caption ?? obj.caption,
    ),
  };
}

function escapeRawNewlinesInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString && (ch === "\n" || ch === "\r")) {
      if (ch === "\n") out += "\\n";
      continue;
    }
    out += ch;
  }
  return out;
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start); // objeto truncado — deixa o JSON.parse decidir
}

// ── util ─────────────────────────────────────────────────────
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function stripCodeFences(s: string): string {
  return s.replace(/```(?:json|text)?/gi, "").replace(/```/g, "");
}
