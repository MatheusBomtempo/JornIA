import "server-only";
import { env } from "./env";

/**
 * Cliente do Instagram Graph API (Meta) — publicação em 2 passos:
 *   1. POST /{ig-user-id}/media        (image_url + caption) -> creation_id
 *   2. POST /{ig-user-id}/media_publish (creation_id)        -> media id publicado
 *
 * Requisitos (SPEC.md): conta Instagram Business/Creator vinculada a uma Página
 * do Facebook, app no developers.facebook.com, conta como Instagram Tester.
 * Como só publica na própria conta, o app pode rodar em modo de desenvolvimento.
 * Permissão: instagram_business_content_publish.
 */

export interface PublishResult {
  creationId: string;
  mediaId: string;
  permalink?: string;
}

function baseUrl(): string {
  return `https://graph.facebook.com/${env.instagram.graphVersion}`;
}

function assertConfigured(): { userId: string; token: string } {
  const userId = env.instagram.userId;
  const token = env.instagram.accessToken;
  if (!userId || !token) {
    throw new Error(
      "Instagram não configurado: defina IG_USER_ID e IG_ACCESS_TOKEN.",
    );
  }
  return { userId, token };
}

/** Passo 1: cria o container de mídia. */
export async function createMediaContainer(
  imageUrl: string,
  caption: string,
): Promise<string> {
  const { userId, token } = assertConfigured();
  const res = await fetch(`${baseUrl()}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: token,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(igError("criar container de mídia", data));
  }
  return data.id as string;
}

/** Passo 2: publica o container. */
export async function publishMediaContainer(
  creationId: string,
): Promise<string> {
  const { userId, token } = assertConfigured();
  const res = await fetch(`${baseUrl()}/${userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    throw new Error(igError("publicar mídia", data));
  }
  return data.id as string;
}

/** Busca o permalink do post publicado (opcional, best-effort). */
export async function fetchPermalink(mediaId: string): Promise<string | undefined> {
  try {
    const { token } = assertConfigured();
    const res = await fetch(
      `${baseUrl()}/${mediaId}?fields=permalink&access_token=${token}`,
    );
    const data = await res.json();
    return typeof data.permalink === "string" ? data.permalink : undefined;
  } catch {
    return undefined;
  }
}

/** Fluxo completo de publicação (container + publish + permalink). */
export async function publishToInstagram(
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const creationId = await createMediaContainer(imageUrl, caption);
  const mediaId = await publishMediaContainer(creationId);
  const permalink = await fetchPermalink(mediaId);
  return { creationId, mediaId, permalink };
}

function igError(action: string, data: unknown): string {
  const err = (data as { error?: { message?: string } })?.error;
  return `Erro ao ${action} no Instagram: ${err?.message ?? JSON.stringify(data)}`;
}
