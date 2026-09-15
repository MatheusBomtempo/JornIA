import "server-only";
import { prisma } from "../db";

const THROTTLE_MS = 60 * 60 * 1000; // no máximo 1x por hora
let lastRunAt = 0;

/**
 * Aciona a limpeza de posts expirados. A regra em si (o que apagar, quando,
 * e o log mínimo que fica) mora inteira no banco, na função PL/pgSQL
 * `cleanup_expired_posts()` (ver prisma/migrations/..._cleanup_expired_posts_function).
 * Isso é só o "despertador": sem pg_cron disponível no Postgres do Windows
 * local, chamamos a função de forma oportunista sempre que alguém carrega o
 * feed, com throttle pra não bater no banco a cada requisição. Num host que
 * tenha pg_cron/pgAgent, basta agendar `SELECT cleanup_expired_posts();` lá
 * e remover esta chamada — nenhuma outra mudança necessária.
 */
export async function maybeCleanupExpiredPosts(): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < THROTTLE_MS) return;
  lastRunAt = now;
  try {
    await prisma.$executeRaw`SELECT cleanup_expired_posts();`;
  } catch (err) {
    console.error("[JornIA] Falha ao rodar cleanup_expired_posts:", err);
  }
}
