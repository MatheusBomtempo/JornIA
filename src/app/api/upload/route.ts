import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { putObject } from "@/lib/storage";
import { badRequest, created, route } from "@/lib/http";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Upload de mídia (fotos de origem, overlays de template) para o storage
 * configurado. Retorna a URL pública usada depois em POST /posts, /art-templates, etc.
 */
export const POST = route(async (req: NextRequest) => {
  await requireUser();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Campo 'file' ausente.");
  if (!ALLOWED.has(file.type)) {
    throw badRequest("Formato não suportado (use JPEG, PNG ou WebP).");
  }
  if (file.size > MAX_BYTES) throw badRequest("Arquivo maior que 15 MB.");

  const ext = path.extname(file.name) || `.${file.type.split("/")[1] ?? "bin"}`;
  const key = `sources/${new Date().getFullYear()}/${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { url } = await putObject(key, buffer, file.type);
  return created({ url, key });
});
