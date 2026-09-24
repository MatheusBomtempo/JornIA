import "server-only";
import { prisma } from "../db";
import { POST_STATUS } from "../domain";
import { PURGE_SELECT, purgePostsWithMedia } from "./retention";

/**
 * Limpeza manual do admin (Admin → Configurações → Zona de perigo), pra
 * zerar a base entre rodadas de teste e liberar storage no R2.
 *
 * Sempre restrita à EMPRESA de quem pediu — nunca encosta em dado de outra
 * redação. Posts saem pelo mesmo caminho da retenção (purgePostsWithMedia):
 * primeiro os arquivos no storage (fotos, vídeos, frames de prévia, artes e
 * vídeos renderizados), depois as linhas do banco.
 *
 * Nunca apaga: usuários, a empresa (nome/logo/@), templates de arte,
 * exemplos de estilo, API keys e configurações — isso é configuração, não
 * dado de teste, e refazer um template de marca dá trabalho.
 */
export type ResetScope = "unpublished" | "all";

export interface ResetResult {
  posts: number;
  logs: number;
}

// "Ainda não subiu" = tudo que não está publicado. `publishing` fica de
// fora: é o instante em que o post está indo pro Instagram, e apagar no meio
// deixaria a publicação órfã.
const KEEP_WHEN_UNPUBLISHED = [POST_STATUS.PUBLISHED, POST_STATUS.PUBLISHING];

export async function resetCompanyData(companyId: string, scope: ResetScope): Promise<ResetResult> {
  const posts = await prisma.post.findMany({
    where:
      scope === "unpublished"
        ? { companyId, status: { notIn: KEEP_WHEN_UNPUBLISHED } }
        : { companyId },
    select: PURGE_SELECT,
  });

  await purgePostsWithMedia(posts);

  // "Apagar tudo" também zera o histórico (o registro de "publicações
  // removidas automaticamente" e o rastro que o próprio purge acabou de
  // gravar) — a pedido: base limpa, só com os usuários.
  let logs = 0;
  if (scope === "all") {
    ({ count: logs } = await prisma.postAuditLog.deleteMany({ where: { companyId } }));
  }

  return { posts: posts.length, logs };
}
