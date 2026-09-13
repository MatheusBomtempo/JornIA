import "server-only";
import sharp from "sharp";
import { putObject } from "../storage";
import {
  photoSlotSchema,
  textSlotSchema,
  photoTransformSchema,
  type PhotoSlot,
  type TextSlot,
  type PhotoTransform,
} from "./slots";

/**
 * Render final da arte no servidor (Sharp), a partir dos MESMOS parâmetros
 * salvos pelo editor — não a partir do canvas do navegador. Garante qualidade
 * e reprodutibilidade (SPEC.md).
 */

export interface RenderArtParams {
  canvasWidth: number;
  canvasHeight: number;
  overlayAssetUrl: string;
  photoUrl: string;
  photoSlot: unknown; // JSON do template (validado aqui)
  textSlot: unknown; // JSON do template (validado aqui)
  transform: unknown; // JSON do editor (validado aqui)
  artText: string;
}

export async function renderArt(params: RenderArtParams): Promise<Buffer> {
  const photoSlot = photoSlotSchema.parse(params.photoSlot);
  const textSlot = textSlotSchema.parse(params.textSlot);
  const transform = photoTransformSchema.parse(params.transform ?? {});

  const [photoBuf, overlayBuf] = await Promise.all([
    fetchBuffer(params.photoUrl),
    fetchBuffer(params.overlayAssetUrl),
  ]);

  const layers: sharp.OverlayOptions[] = [];

  // 1) Foto posicionada dentro do slot (com pan/zoom), recortada ao slot.
  const slotImg = await renderPhotoIntoSlot(photoBuf, photoSlot, transform);
  if (slotImg) {
    layers.push({
      input: slotImg,
      left: Math.round(photoSlot.x),
      top: Math.round(photoSlot.y),
    });
  }

  // 2) Overlay do template (moldura/marca) por cima da foto.
  const overlayResized = await sharp(overlayBuf)
    .resize(params.canvasWidth, params.canvasHeight, { fit: "fill" })
    .png()
    .toBuffer();
  layers.push({ input: overlayResized, left: 0, top: 0 });

  // 3) Texto da arte (renderizado como SVG e composto).
  if (params.artText?.trim()) {
    const textSvg = renderTextSvg(params.artText, textSlot);
    layers.push({
      input: Buffer.from(textSvg),
      left: Math.round(textSlot.x),
      top: Math.round(textSlot.y),
    });
  }

  return sharp({
    create: {
      width: params.canvasWidth,
      height: params.canvasHeight,
      channels: 4,
      background: { r: 17, g: 17, b: 17, alpha: 1 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

/** Render + upload no storage, devolvendo a URL pública. */
export async function renderAndStore(
  params: RenderArtParams,
  key: string,
): Promise<string> {
  const buf = await renderArt(params);
  const { url } = await putObject(key, buf, "image/png");
  return url;
}

// ── Internos ─────────────────────────────────────────────────

async function renderPhotoIntoSlot(
  photoBuf: Buffer,
  slot: PhotoSlot,
  t: PhotoTransform,
): Promise<Buffer | null> {
  const meta = await sharp(photoBuf).metadata();
  const iw = meta.width ?? slot.width;
  const ih = meta.height ?? slot.height;

  // scale=1 => "cover" do slot; scale ajusta o zoom por cima disso.
  const coverScale = Math.max(slot.width / iw, slot.height / ih);
  const finalScale = coverScale * t.scale;
  const dispW = Math.max(1, Math.round(iw * finalScale));
  const dispH = Math.max(1, Math.round(ih * finalScale));

  const resized = await sharp(photoBuf).resize(dispW, dispH).toBuffer();

  // Posição do topo-esquerdo da foto relativa ao topo-esquerdo do slot.
  const left = Math.round((slot.width - dispW) / 2 + t.offsetX);
  const top = Math.round((slot.height - dispH) / 2 + t.offsetY);

  // Região da foto redimensionada que cai dentro do slot.
  const ex = Math.max(0, -left);
  const ey = Math.max(0, -top);
  const ew = Math.min(dispW - ex, slot.width - Math.max(0, left));
  const eh = Math.min(dispH - ey, slot.height - Math.max(0, top));
  if (ew <= 0 || eh <= 0) return null; // foto fora de vista

  const region = await sharp(resized)
    .extract({ left: ex, top: ey, width: ew, height: eh })
    .toBuffer();

  return sharp({
    create: {
      width: Math.round(slot.width),
      height: Math.round(slot.height),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: region, left: Math.max(0, left), top: Math.max(0, top) },
    ])
    .png()
    .toBuffer();
}

function renderTextSvg(text: string, slot: TextSlot): string {
  const lines = wrapText(text, slot);
  const lineHeightPx = slot.fontSize * slot.lineHeight;

  const anchor =
    slot.align === "center" ? "middle" : slot.align === "right" ? "end" : "start";
  const tx =
    slot.align === "center"
      ? slot.width / 2
      : slot.align === "right"
        ? slot.width
        : 0;

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${tx}" dy="${i === 0 ? slot.fontSize : lineHeightPx}">${escapeXml(
          line,
        )}</tspan>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${slot.width}" height="${slot.height}">
  <text font-family="${escapeXml(slot.font)}" font-size="${slot.fontSize}" font-weight="${slot.weight}" fill="${slot.color}" text-anchor="${anchor}">${tspans}</text>
</svg>`;
}

/** Quebra de linha aproximada por largura (estimativa de largura de glifo). */
function wrapText(text: string, slot: TextSlot): string[] {
  const maxChars = Math.max(
    1,
    Math.floor(slot.width / (slot.fontSize * 0.55)),
  );
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchBuffer(url: string): Promise<Buffer> {
  // Suporta caminhos locais servidos pela app e URLs remotas.
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar recurso (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
