import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { assertPexelsDownloadUrl } from "@/lib/services/photo-search";
import { importPexelsPhotoSchema } from "@/lib/validation";
import { compressSourcePhoto } from "@/lib/media";
import { putObject } from "@/lib/storage";
import { badRequest, created, route } from "@/lib/http";

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024; // o "original" do Pexels pode ser grande; recomprimimos depois

// POST /photo-search/import — baixa, do lado do servidor, a foto escolhida
// no picker do Pexels e devolve a URL já no nosso storage (mesmo formato do
// /api/upload), pra anexar ao post com o POST /posts/:id/photos de sempre.
// Não é um proxy genérico: assertPexelsDownloadUrl trava o host em
// *.pexels.com (a URL vem do cliente, então isso evita SSRF).
export const POST = route(async (req: NextRequest) => {
  await requireUser();
  const { downloadUrl } = importPexelsPhotoSchema.parse(await req.json());
  const url = assertPexelsDownloadUrl(downloadUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    const why = (err as Error).name === "AbortError" ? "tempo esgotado" : (err as Error).message;
    throw badRequest(`Não foi possível baixar a foto do Pexels (${why}).`);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw badRequest(`Pexels recusou o download (HTTP ${res.status}).`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw badRequest("O link do Pexels não retornou uma imagem.");
  }

  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.byteLength > MAX_DOWNLOAD_BYTES) {
    throw badRequest("Imagem do Pexels maior do que o esperado.");
  }

  const buffer = await compressSourcePhoto(raw);
  const key = `sources/${new Date().getFullYear()}/${randomUUID()}.jpg`;
  const { url: storedUrl } = await putObject(key, buffer, "image/jpeg");
  return created({ url: storedUrl, key });
});
