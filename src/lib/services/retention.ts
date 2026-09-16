import "server-only";
import { prisma } from "../db";
import { deleteObjectByUrl } from "../storage";

const PUBLISHED_TTL_DAYS = 2;
const PENDING_TTL_DAYS = 3; // in_review | failed

type PurgeCandidate = {
  id: string;
  photos: { storageUrl: string }[];
  versions: { renderedArtUrl: string | null }[];
};

/**
 * Apaga o storage (fotos + arte renderizada) dos posts dados e só então as
 * linhas do banco (via purge_posts, com audit log — ver
 * prisma/migrations/..._purge_posts_function). Compartilhado pela limpeza
 * automática (cleanupExpiredPosts) e pelo apagar manual do admin
 * (deletePostNow, em services/posts.ts) — mesma garantia nos dois: nunca
 * sobra arquivo órfão no R2 nem linha sem audit log.
 */
export async function purgePostsWithMedia(posts: PurgeCandidate[]): Promise<void> {
  if (posts.length === 0) return;

  const urls = new Set<string>();
  for (const post of posts) {
    for (const photo of post.photos) urls.add(photo.storageUrl);
    for (const version of post.versions) {
      if (version.renderedArtUrl) urls.add(version.renderedArtUrl);
    }
  }

  // Apaga o storage primeiro; se uma URL falhar, loga e segue — a política de
  // retenção (o dado tem que sumir do banco no prazo) importa mais que um
  // objeto órfão raro no R2, que não pesa nada no uso (ver conversa sobre
  // custo de storage).
  await Promise.all(
    [...urls].map((url) =>
      deleteObjectByUrl(url).catch((err) =>
        console.error(`[JornAI] Falha ao apagar do storage (${url}):`, err),
      ),
    ),
  );

  const ids = posts.map((p) => p.id);
  await prisma.$executeRaw`SELECT purge_posts(${ids}::uuid[]);`;
}

/**
 * Limpeza de posts expirados (publicado há mais de 2 dias, ou em revisão/
 * falhou há mais de 3). "Apagar" nunca mexe no Instagram — só remove do
 * nosso banco+storage.
 *
 * A regra de expiração mora aqui (não em SQL) de propósito: só o app
 * consegue apagar o arquivo real no R2, então o app precisa decidir "quem
 * expirou" antes de apagar storage, e usar o MESMO conjunto de ids depois
 * pra apagar as linhas do banco — daí purge_posts(ids) receber ids prontos
 * em vez de recalcular a regra.
 */
export async function cleanupExpiredPosts(): Promise<{ purged: number }> {
  const publishedCutoff = new Date(Date.now() - PUBLISHED_TTL_DAYS * 86_400_000);
  const pendingCutoff = new Date(Date.now() - PENDING_TTL_DAYS * 86_400_000);

  const expired = await prisma.post.findMany({
    where: {
      OR: [
        { status: "published", updatedAt: { lt: publishedCutoff } },
        { status: { in: ["in_review", "failed"] }, updatedAt: { lt: pendingCutoff } },
      ],
    },
    select: {
      id: true,
      photos: { select: { storageUrl: true } },
      versions: { select: { renderedArtUrl: true } },
    },
  });
  if (expired.length === 0) return { purged: 0 };

  await purgePostsWithMedia(expired);
  return { purged: expired.length };
}

const THROTTLE_MS = 60 * 60 * 1000; // no máximo 1x por hora
let lastRunAt = 0;

/**
 * Despertador oportunista: roda a limpeza quando alguém carrega o feed, com
 * throttle em memória — só um backstop para dev local (sem cron). Em prod
 * (Vercel), quem manda é o Vercel Cron batendo em /api/cron/cleanup 1x/dia
 * (ver vercel.json); esta função continua inofensiva ali porque o throttle
 * em memória zera a cada cold start, mas cleanupExpiredPosts() é barata
 * quando não há nada expirado.
 */
export async function maybeCleanupExpiredPosts(): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < THROTTLE_MS) return;
  lastRunAt = now;
  try {
    await cleanupExpiredPosts();
  } catch (err) {
    console.error("[JornAI] Falha ao rodar cleanupExpiredPosts:", err);
  }
}
