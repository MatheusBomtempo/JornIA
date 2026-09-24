import type * as opentypeNS from "opentype.js";
import { applyTransform, type TextSlot } from "./slots";

/**
 * Layout de texto com Poppins convertido em VETOR (paths SVG) — isomórfico:
 * o MESMO código roda no render do servidor (arte final, vídeo) e no editor
 * de arte do navegador. Só quem carrega o arquivo da fonte muda (fs no
 * servidor, fetch no navegador — o mesmo .woff do @fontsource). É isso que
 * garante que o preview do editor é idêntico à arte da revisão: antes o
 * editor usava o texto do Fabric, com métricas próprias e sem encolher a
 * fonte — título longo quebrava em 3 linhas e encostava no subtítulo, que
 * na arte final nunca acontece (ver fitToSlot).
 *
 * Por que vetor em vez de <text font-family="Poppins">: o Sharp renderiza SVG
 * via librsvg, que só enxerga fontes instaladas no sistema operacional.
 *
 * Cada glifo é desenhado UMA vez na origem e posicionado por `transform`.
 * Isso não é só otimização: chamar `getPath()` repetidamente no mesmo glifo
 * faz o opentype.js devolver coordenadas NaN a partir da segunda ocorrência,
 * e um NaN no atributo `d` faz o librsvg parar de desenhar no meio da frase.
 */

export type Font = ReturnType<typeof opentypeNS.parse>;
type Glyph = ReturnType<Font["charToGlyph"]>;
export type Weight = 400 | 600 | 700;

/** path data por glifo+tamanho: "400:24:86" -> "M6.5 0.2Q…" */
const glyphCache = new Map<string, string>();

function glyphPathData(glyph: Glyph, weight: Weight, size: number): string {
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
function advanceOf(font: Font, glyph: Glyph, prev: Glyph | null, size: number): number {
  const scale = size / font.unitsPerEm;
  let adv = (glyph.advanceWidth ?? 0) * scale;
  if (prev) {
    const k = font.getKerningValue(prev, glyph);
    if (Number.isFinite(k)) adv += k * scale;
  }
  return Number.isFinite(adv) ? adv : 0;
}

export function measure(font: Font, text: string, size: number): number {
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

/** Um glifo pronto pra desenhar: path na origem + onde ele vai (já arredondado). */
export interface PlacedGlyph {
  d: string;
  x: number;
  y: number;
}

export interface TextLayout {
  glyphs: PlacedGlyph[];
  height: number;
  lines: number;
}

/**
 * Posiciona cada glifo do texto dentro do slot, em coordenadas absolutas do
 * canvas. O texto é ancorado no TOPO do slot e cresce para baixo, mas NUNCA
 * ultrapassa `slot.height` — ver `fitToSlot`. Isso garante que título e
 * subtítulo, cada um preso à própria caixa, jamais se sobrepõem, não importa
 * o tamanho do texto. x/y saem arredondados em 2 casas — os mesmos números
 * que vão pro SVG do servidor, pro editor desenhar no mesmo lugar.
 */
export function layoutText(font: Font, rawText: string, slot: TextSlot): TextLayout {
  const text = applyTransform(rawText.trim(), slot.transform);
  if (!text) return { glyphs: [], height: 0, lines: 0 };

  const weight = slot.weight as Weight;
  const { lines, fontSize, lineHeight } = fitToSlot(font, text, slot);
  const ascender = (font.ascender / font.unitsPerEm) * fontSize;

  const glyphs: PlacedGlyph[] = [];

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
        glyphs.push({ d, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
      }
      x += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
      prev = glyph;
    }
  });

  if (!glyphs.length) return { glyphs: [], height: 0, lines: 0 };
  return {
    glyphs,
    height: (lines.length - 1) * lineHeight + fontSize * slot.lineHeight,
    lines: lines.length,
  };
}

/** O mesmo layout como SVG — é o que o Sharp (servidor) desenha. */
export function textToSvg(font: Font, rawText: string, slot: TextSlot): RenderedText {
  const { glyphs, height, lines } = layoutText(font, rawText, slot);
  if (!glyphs.length) return { svg: "", height: 0, lines: 0 };

  const parts = glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x.toFixed(2)} ${g.y.toFixed(2)})"/>`);
  // Um único <g> com a cor evita repetir o fill em cada glifo.
  return { svg: `<g fill="${slot.color}">${parts.join("")}</g>`, height, lines };
}
