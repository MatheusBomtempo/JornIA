import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requireUser } from "@/lib/auth";
import { putObject } from "@/lib/storage";
import { badRequest, created, route } from "@/lib/http";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB, antes de comprimir
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DIMENSION = 1600; // a arte final nunca passa de ~1080-1350px de lado

/**
 * Upload de mídia para o storage configurado. Retorna a URL pública usada
 * depois em POST /posts, /art-templates, etc. Dois usos, tratados diferente:
 *  - "photo" (padrão): foto de origem, só usada internamente (workspace/feed
 *    do JornIA e como insumo do render — nunca publicada direto). Recomprimida
 *    forte: reduz custo de storage sem afetar a arte que vai pro Instagram.
 *  - "overlay": PNG do template (tem transparência, é o design em si) —
 *    gravado como veio, sem recomprimir/achatar o canal alfa.
 */
export const POST = route(async (req: NextRequest) => {
  await requireUser();

  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "overlay" ? "overlay" : "photo";
  if (!(file instanceof File)) throw badRequest("Campo 'file' ausente.");
  if (!ALLOWED.has(file.type)) {
    throw badRequest("Formato não suportado (use JPEG, PNG ou WebP).");
  }
  if (file.size > MAX_BYTES) throw badRequest("Arquivo maior que 15 MB.");

  const raw = Buffer.from(await file.arrayBuffer());

  if (kind === "overlay") {
    const ext = file.type.split("/")[1] ?? "png";
    const key = `overlays/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const { url } = await putObject(key, raw, file.type);
    return created({ url, key });
  }

  const buffer = await sharp(raw)
    .rotate() // auto-orienta pelo EXIF e, ao (re)codificar, descarta o EXIF (inclusive GPS)
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  const key = `sources/${new Date().getFullYear()}/${randomUUID()}.jpg`;
  const { url } = await putObject(key, buffer, "image/jpeg");
  return created({ url, key });
});
