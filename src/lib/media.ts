import "server-only";
import sharp from "sharp";

/** A arte final nunca passa de ~1080-1350px de lado — dá folga sem exagerar. */
export const PHOTO_MAX_DIMENSION = 1600;

/**
 * Recomprime uma foto de origem pro padrão usado no storage (JPEG, lado
 * máximo 1600px, sem EXIF). Compartilhado por /api/upload (envio manual) e
 * pela importação do Pexels (ver services/photo-search.ts) — mesmo destino,
 * mesmo tratamento.
 */
export async function compressSourcePhoto(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .rotate() // auto-orienta pelo EXIF e, ao (re)codificar, descarta o EXIF (inclusive GPS)
    .resize({
      width: PHOTO_MAX_DIMENSION,
      height: PHOTO_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}
