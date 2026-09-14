import "server-only";
import sharp from "sharp";
import { putObject } from "../storage";
import { renderTextToSvg } from "./text";
import {
  photoSlotSchema,
  textSlotSchema,
  photoTransformSchema,
  textOffsetSchema,
  type PhotoSlot,
  type PhotoTransform,
  type TextSlot,
} from "./slots";

/**
 * Render final da arte no servidor (Sharp), a partir dos MESMOS parâmetros
 * salvos pelo editor — não a partir do canvas do navegador. Garante qualidade
 * e reprodutibilidade (SPEC.md).
 *
 * Composição, de baixo para cima:
 *   1. foto (com pan/zoom, recortada ao slot)
 *   2. overlay do template (PNG da marca, transparente onde a foto aparece)
 *   3. título  (Poppins, vetorizado)
 *   4. subtítulo (Poppins, vetorizado)
 */

export interface RenderArtParams {
  canvasWidth: number;
  canvasHeight: number;
  overlayAssetUrl: string;
  photoUrl: string;
  photoSlot: unknown;
  titleSlot: unknown;
  subtitleSlot?: unknown;
  transform: unknown;
  title: string;
  subtitle?: string;
  /** Deslocamento opcional do título/subtítulo — template continua intacto. */
  titleOffset?: unknown;
  subtitleOffset?: unknown;
}

/** Aplica o deslocamento (se houver) mantendo largura/altura do slot intactas. */
function offsetSlot(slot: TextSlot, rawOffset: unknown): TextSlot {
  const { offsetX, offsetY } = textOffsetSchema.parse(rawOffset ?? {});
  if (!offsetX && !offsetY) return slot;
  return { ...slot, x: slot.x + offsetX, y: slot.y + offsetY };
}

export async function renderArt(params: RenderArtParams): Promise<Buffer> {
  const photoSlot = photoSlotSchema.parse(params.photoSlot);
  const titleSlot = textSlotSchema.parse(params.titleSlot);
  const transform = photoTransformSchema.parse(params.transform ?? {});
  const subtitleSlot = params.subtitleSlot
    ? textSlotSchema.parse(params.subtitleSlot)
    : null;

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

  // 2) Overlay do template.
  const overlayResized = await sharp(overlayBuf)
    .resize(params.canvasWidth, params.canvasHeight, { fit: "fill" })
    .png()
    .toBuffer();
  layers.push({ input: overlayResized, left: 0, top: 0 });

  // 3 + 4) Título e subtítulo em Poppins vetorizada, num único SVG.
  // O deslocamento (se o jornalista moveu o texto nesta versão) desloca só
  // a posição — largura, fonte e quebra de linha continuam do template.
  const title = await renderTextToSvg(
    params.title ?? "",
    offsetSlot(titleSlot, params.titleOffset),
  );
  const subtitle = subtitleSlot
    ? await renderTextToSvg(
        params.subtitle ?? "",
        offsetSlot(subtitleSlot, params.subtitleOffset),
      )
    : { svg: "", height: 0, lines: 0 };

  if (title.svg || subtitle.svg) {
    const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${params.canvasWidth}" height="${params.canvasHeight}">
${title.svg}
${subtitle.svg}
</svg>`;
    layers.push({ input: Buffer.from(textSvg), left: 0, top: 0 });
  }

  return sharp({
    create: {
      width: params.canvasWidth,
      height: params.canvasHeight,
      channels: 4,
      background: { r: 12, g: 14, b: 18, alpha: 1 },
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

  const left = Math.round((slot.width - dispW) / 2 + t.offsetX);
  const top = Math.round((slot.height - dispH) / 2 + t.offsetY);

  const ex = Math.max(0, -left);
  const ey = Math.max(0, -top);
  const ew = Math.min(dispW - ex, slot.width - Math.max(0, left));
  const eh = Math.min(dispH - ey, slot.height - Math.max(0, top));
  if (ew <= 0 || eh <= 0) return null;

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

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar recurso (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
