import "server-only";
import * as opentypeNS from "opentype.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TextSlot } from "./slots";
import { measure, textToSvg, type Font, type RenderedText, type Weight } from "./text-svg";

/**
 * Lado servidor do texto em vetor: só carrega a Poppins do disco. Todo o
 * layout (quebra, encolher pra caber no slot, "…", posição de cada glifo)
 * está em text-svg.ts, compartilhado com o editor de arte do navegador —
 * mesmo código + mesmo arquivo de fonte = preview idêntico à arte final.
 */

export type { RenderedText } from "./text-svg";

// opentype.js é CommonJS: aceita tanto default quanto namespace.
const opentype = (
  (opentypeNS as unknown as { default?: typeof opentypeNS }).default ?? opentypeNS
) as typeof opentypeNS;

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "poppins", "files");

const fontCache = new Map<Weight, Font>();

/** Caminho do .woff de um peso — também servido ao navegador por /api/fonts/poppins/[weight]. */
export function poppinsFile(weight: Weight): string {
  return path.join(FONT_DIR, `poppins-latin-${weight}-normal.woff`);
}

async function loadFont(weight: Weight): Promise<Font> {
  const cached = fontCache.get(weight);
  if (cached) return cached;

  let buf: Buffer;
  try {
    buf = await readFile(poppinsFile(weight));
  } catch {
    throw new Error(
      `Fonte Poppins ${weight} não encontrada. Rode "npm install" para restaurar @fontsource/poppins.`,
    );
  }

  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fontCache.set(weight, font);
  return font;
}

/**
 * Gera os paths do texto dentro do slot, em coordenadas absolutas do canvas.
 * Ver textToSvg (text-svg.ts) — o texto nunca ultrapassa a altura do slot.
 */
export async function renderTextToSvg(rawText: string, slot: TextSlot): Promise<RenderedText> {
  if (!rawText.trim()) return { svg: "", height: 0, lines: 0 };
  return textToSvg(await loadFont(slot.weight as Weight), rawText, slot);
}

/** Mede a largura de um texto (usado para validação/preview). */
export async function measureText(text: string, size: number, weight: Weight = 600): Promise<number> {
  return measure(await loadFont(weight), text, size);
}
