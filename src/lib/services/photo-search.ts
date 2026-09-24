import "server-only";
import { env } from "../env";
import { ApiError, badRequest } from "../http";

/**
 * Busca de fotos embutida no passo "Imagem" (ver ImageSuggestions em
 * PostWorkspace) — o Pexels é um banco de imagens livre de direitos, com
 * API gratuita generosa (200 req/hora). Não é a foto real do fato (isso só
 * o Google Imagens acharia, e não dá pra embutir/automatizar: a página de
 * resultados bloqueia iframe e não há API gratuita equivalente) — serve só
 * como ilustração rápida, sem precisar sair do site pra baixar e reenviar.
 */
export interface PhotoSearchItem {
  id: number;
  thumbnailUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
}

interface PexelsApiPhoto {
  id: number;
  width: number;
  height: number;
  alt?: string | null;
  photographer?: string;
  photographer_url?: string;
  src?: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    small?: string;
  };
}

const PER_PAGE = 15;
const FETCH_TIMEOUT_MS = 10_000;
/**
 * As buscas vêm das sugestões da IA — em português, como as notícias. Sem
 * locale o Pexels interpreta a busca em inglês: "galpão em chamas" trazia
 * foto de raposa; com pt-BR, 12 de 15 resultados eram de incêndio.
 */
const PEXELS_LOCALE = "pt-BR";

export function isPhotoSearchEnabled(): boolean {
  return Boolean(env.photoSearch.pexelsKey);
}

export async function searchPhotos(
  query: string,
  page: number,
): Promise<{ photos: PhotoSearchItem[]; nextPage: number | null }> {
  const key = env.photoSearch.pexelsKey;
  if (!key) {
    throw new ApiError(501, "Busca de fotos não configurada (defina PEXELS_API_KEY).");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&locale=${PEXELS_LOCALE}`,
      { headers: { Authorization: key }, signal: controller.signal, cache: "no-store" },
    );
  } catch (err) {
    const why =
      (err as Error).name === "AbortError" ? "tempo esgotado" : (err as Error).message;
    throw new ApiError(502, `Pexels não respondeu (${why}).`);
  } finally {
    clearTimeout(timeout);
  }

  const body = (await res.json().catch(() => null)) as
    | { photos?: PexelsApiPhoto[]; next_page?: string }
    | null;
  if (!res.ok) {
    throw new ApiError(502, `Pexels recusou a busca (HTTP ${res.status}).`);
  }

  const photos: PhotoSearchItem[] = (body?.photos ?? [])
    .filter((p) => p.src?.medium || p.src?.small)
    .map((p) => ({
      id: p.id,
      thumbnailUrl: (p.src!.medium ?? p.src!.small) as string,
      downloadUrl: (p.src!.large2x ?? p.src!.large ?? p.src!.original ?? p.src!.medium) as string,
      width: p.width,
      height: p.height,
      photographer: p.photographer ?? "",
      photographerUrl: p.photographer_url ?? "",
      alt: p.alt || query,
    }));

  return { photos, nextPage: body?.next_page ? page + 1 : null };
}

// SSRF: este endpoint faz fetch de uma URL vinda do CLIENTE (a foto que a
// pessoa clicou no picker) — sem essa checagem, seria um proxy genérico pra
// baixar qualquer URL a partir do servidor. Só aceita subdomínios do Pexels
// (é de onde vêm os "src.*" da própria busca, ex.: images.pexels.com).
const ALLOWED_DOWNLOAD_HOST = /(^|\.)pexels\.com$/i;

export function assertPexelsDownloadUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest("URL de imagem inválida.");
  }
  if (url.protocol !== "https:" || !ALLOWED_DOWNLOAD_HOST.test(url.hostname)) {
    throw badRequest("Só é permitido importar imagens de images.pexels.com.");
  }
  return url;
}
