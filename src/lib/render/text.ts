import "server-only";
import * as opentypeNS from "opentype.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyTransform, type TextSlot } from "./slots";

/**
 * Layout de texto com Poppins convertido em VETOR (paths SVG).
 *
 * Por que vetor em vez de <text font-family="Poppins">: o Sharp renderiza SVG
 * via librsvg, que só enxerga fontes instaladas no sistema operacional. Como a
 * Poppins vem embarcada no projeto (@fontsource/poppins), transformamos cada
 * glifo em `<path>` — o resultado fica idêntico em dev, CI e produção.
 *
 * Cada glifo é desenhado UMA vez na origem e posicionado por `transform`.
 * Isso não é só otimização: chamar `getPath()` repetidamente no mesmo glifo
 * faz o opentype.js devolver coordenadas NaN a partir da segunda ocorrência,
 * e um NaN no atributo `d` faz o librsvg parar de desenhar no meio da frase.
 */

// opentype.js é CommonJS: aceita tanto default quanto namespace.
const opentype = (
  (opentypeNS as unknown as { default?: typeof opentypeNS }).default ?? opentypeNS
) as typeof opentypeNS;

type Font = ReturnType<typeof opentype.parse>;
type Glyph = ReturnType<Font["charToGlyph"]>;

const FONT_DIR = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "poppins",
  "files",
);

type Weight = 400 | 600 | 700;
const fontCache = new Map<Weight, Font>();
/** path data por glifo+tamanho: "400:24:86" -> "M6.5 0.2Q…" */
const glyphCache = new Map<string, string>();

async function loadFont(weight: Weight): Promise<Font> {
  const cached = fontCache.get(weight);
  if (cached) return cached;

  const file = path.join(FONT_DIR, `poppins-latin-${weight}-normal.woff`);
  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch {
    throw new Error(
      `Fonte Poppins ${weight} não encontrada. Rode "npm install" para restaurar @fontsource/poppins.`,
    );
  }

  const font = opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  fontCache.set(weight, font);
  return font;
}

function glyphPathData(
  glyph: Glyph,
  weight: Weight,
  size: number,
): string {
  const key = `${weight}:${size}:${glyph.index}`;
  const hit = glyphCache.get(key);
  if (hit !== undefined) return hit;

  let d = "";
  try {
    d = glyph.getPath(0, 0, size).toPathData(2);
  } catch {
    d = "";
  }
  // Defesa extra: nunca deixar NaN chegar no SVG.
  if (d.includes("NaN")) d = "";
  glyphCache.set(key, d);
  return d;
}

/** Avanço de um glifo em px, com kerning do par anterior. */
function advanceOf(
  font: Font,
  glyph: Glyph,
  prev: Glyph | null,
  size: number,
): number {
  const scale = size / font.unitsPerEm;
  let adv = (glyph.advanceWidth ?? 0) * scale;
  if (prev) {
    const k = font.getKerningValue(prev, glyph);
    if (Number.isFinite(k)) adv += k * scale;
  }
  return Number.isFinite(adv) ? adv : 0;
}

function measure(font: Font, text: string, size: number): number {
  const glyphs = font.stringToGlyphs(text);
  let w = 0;
  let prev: Glyph | null = null;
  for (const g of glyphs) {
    w += advanceOf(font, g, prev, size);
    prev = g;
  }
  return w;
}

/** Quebra usando a largura real dos glifos (não por contagem de letras). */
function wrap(font: Font, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(font, candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Acrescenta "…" ao final da linha, removendo palavras (ou letras, se preciso)
 * até caber na largura disponível. Diferente de um simples corte por largura:
 * é usada quando LINHAS INTEIRAS foram descartadas por falta de altura, então
 * o "…" precisa aparecer sempre — mesmo que a linha em si já coubesse — para
 * o leitor perceber que o texto foi cortado, em vez de sumir silenciosamente.
 */
function withEllipsis(font: Font, line: string, size: number, maxWidth: number): string {
  if (measure(font, `${line}…`, size) <= maxWidth) return `${line}…`;

  const words = line.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(" ")}…`;
    if (measure(font, candidate, size) <= maxWidth) return candidate;
  }
  // Palavra única maior que o espaço: corta letra a letra.
  let s = words[0] ?? line;
  while (s.length > 1 && measure(font, `${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

const MIN_FIT_SCALE = 0.55; // nunca encolhe além de 55% do tamanho configurado
const SHRINK_STEP = 0.94;

/**
 * Encaixa o texto dentro da altura do slot: primeiro tenta encolher a fonte
 * (até MIN_FIT_SCALE), depois — se ainda não couber — corta linhas e
 * ellipsiza a última visível. Garante que o texto NUNCA ultrapassa a altura
 * do próprio slot, ou seja, título e subtítulo nunca colidem entre si,
 * mesmo com texto bem mais longo do que o esperado.
 */
function fitToSlot(
  font: Font,
  text: string,
  slot: Pick<TextSlot, "fontSize" | "width" | "height" | "lineHeight">,
): { lines: string[]; fontSize: number; lineHeight: number } {
  let fontSize = slot.fontSize;
  const minSize = slot.fontSize * MIN_FIT_SCALE;
  let lines = wrap(font, text, fontSize, slot.width);
  let lineHeight = fontSize * slot.lineHeight;

  while (lines.length * lineHeight > slot.height && fontSize > minSize) {
    fontSize = Math.max(minSize, Math.round(fontSize * SHRINK_STEP * 100) / 100);
    lines = wrap(font, text, fontSize, slot.width);
    lineHeight = fontSize * slot.lineHeight;
  }

  const maxLines = Math.max(1, Math.floor(slot.height / lineHeight));
  if (lines.length > maxLines) {
    // Descartar linhas sem avisar é pior do que só encolher a fonte: o leitor
    // perde parte da frase sem perceber. O "…" sinaliza o corte.
    lines = lines.slice(0, maxLines);
    const last = maxLines - 1;
    lines[last] = withEllipsis(font, lines[last], fontSize, slot.width);
  }

  return { lines, fontSize, lineHeight };
}

export interface RenderedText {
  /** Conteúdo SVG (um <path> por glifo) já posicionado no canvas. */
  svg: string;
  height: number;
  lines: number;
}

/**
 * Gera os paths do texto dentro do slot, em coordenadas absolutas do canvas.
 * O texto é ancorado no TOPO do slot e cresce para baixo, mas NUNCA ultrapassa
 * `slot.height` — ver `fitToSlot`. Isso garante que título e subtítulo, cada
 * um preso à própria caixa, jamais se sobrepõem, não importa o tamanho do texto.
 */
export async function renderTextToSvg(
  rawText: string,
  slot: TextSlot,
): Promise<RenderedText> {
  const text = applyTransform(rawText.trim(), slot.transform);
  if (!text) return { svg: "", height: 0, lines: 0 };

  const weight = slot.weight as Weight;
  const font = await loadFont(weight);
  const { lines, fontSize, lineHeight } = fitToSlot(font, text, slot);
  const ascender = (font.ascender / font.unitsPerEm) * fontSize;

  const parts: string[] = [];

  lines.forEach((line, i) => {
    const lineWidth = measure(font, line, fontSize);
    let x =
      slot.align === "center"
        ? slot.x + (slot.width - lineWidth) / 2
        : slot.align === "right"
          ? slot.x + slot.width - lineWidth
          : slot.x;
    const y = slot.y + ascender + i * lineHeight;

    let prev: Glyph | null = null;
    for (const glyph of font.stringToGlyphs(line)) {
      if (prev) {
        const k = font.getKerningValue(prev, glyph);
        if (Number.isFinite(k)) x += k * (fontSize / font.unitsPerEm);
      }
      const d = glyphPathData(glyph, weight, fontSize);
      if (d.length > 2) {
        parts.push(
          `<path d="${d}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"/>`,
        );
      }
      x += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
      prev = glyph;
    }
  });

  if (!parts.length) return { svg: "", height: 0, lines: 0 };

  // Um único <g> com a cor evita repetir o fill em cada glifo.
  return {
    svg: `<g fill="${slot.color}">${parts.join("")}</g>`,
    height: (lines.length - 1) * lineHeight + fontSize * slot.lineHeight,
    lines: lines.length,
  };
}

/** Mede a largura de um texto (usado para validação/preview). */
export async function measureText(
  text: string,
  size: number,
  weight: Weight = 600,
): Promise<number> {
  return measure(await loadFont(weight), text, size);
}
