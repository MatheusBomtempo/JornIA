import { type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { presignPut } from "@/lib/storage";
import { badRequest, ok, route } from "@/lib/http";

const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const presignSchema = z.object({
  contentType: z.string(),
});

/**
 * POST /api/upload/presign — URL de upload direto pro storage (S3/R2), pro
 * navegador mandar o vídeo sem passar pelo corpo da function. Vídeo é o
 * único caso hoje: mesmo com o teto de 100 MB do app, o corpo de uma
 * function na Vercel tem um limite bem menor, e isso já derrubou upload de
 * vídeo em produção com 413 antes do arquivo sequer chegar no código
 * (ver POST /api/upload). Foto continua pelo fluxo antigo — 15 MB cabe.
 *
 * Em storage local (dev) não existe endpoint HTTP pra assinar; devolve
 * uploadUrl nulo e quem chamou cai de volta pro POST /api/upload de sempre.
 */
export const POST = route(async (req: NextRequest) => {
  await requireUser();

  const { contentType } = presignSchema.parse(await req.json());
  if (!ALLOWED_VIDEO.has(contentType)) {
    throw badRequest("Formato não suportado (use MP4, MOV ou WebM).");
  }

  const ext = contentType.split("/")[1] ?? "mp4";
  const key = `sources/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
  const presigned = await presignPut(key, contentType);

  return ok(presigned ?? { uploadUrl: null });
});
