import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { putObject } from "@/lib/storage";
import { compressSourcePhoto } from "@/lib/media";
import { badRequest, created, route } from "@/lib/http";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB, antes de comprimir
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB — teto de body do Vercel Functions
const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);

// Upload de vídeo pode ser lento em conexão fraca; render final é feito à
// parte (ver /api/posts/[id]/video), este endpoint só recebe o arquivo.
export const maxDuration = 120;

/**
 * Upload de mídia para o storage configurado. Retorna a URL pública usada
 * depois em POST /posts, /art-templates, etc. Usos, tratados diferente:
 *  - "photo" (padrão): foto de origem, só usada internamente (workspace/feed
 *    do JornAI e como insumo do render — nunca publicada direto). Recomprimida
 *    forte: reduz custo de storage sem afetar a arte que vai pro Instagram.
 *  - "overlay": PNG do template (tem transparência, é o design em si) —
 *    gravado como veio, sem recomprimir/achatar o canal alfa.
 *  - "video": vídeo de origem pro post de vídeo — gravado como veio (o
 *    render final com o texto animado acontece à parte, via ffmpeg).
 */
export const POST = route(async (req: NextRequest) => {
  await requireUser();

  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = form.get("kind");
  const kind = kindRaw === "overlay" ? "overlay" : kindRaw === "video" ? "video" : "photo";
  if (!(file instanceof File)) throw badRequest("Campo 'file' ausente.");

  if (kind === "video") {
    if (!ALLOWED_VIDEO.has(file.type)) {
      throw badRequest("Formato não suportado (use MP4, MOV ou WebM).");
    }
    if (file.size > MAX_VIDEO_BYTES) throw badRequest("Arquivo maior que 100 MB.");
    const raw = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split("/")[1] ?? "mp4";
    const key = `sources/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const { url } = await putObject(key, raw, file.type);
    return created({ url, key });
  }

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

  const buffer = await compressSourcePhoto(raw);

  const key = `sources/${new Date().getFullYear()}/${randomUUID()}.jpg`;
  const { url } = await putObject(key, buffer, "image/jpeg");
  return created({ url, key });
});
