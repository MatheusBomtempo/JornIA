import { type NextRequest } from "next/server";
import { cleanupExpiredPosts } from "@/lib/services/retention";
import { env } from "@/lib/env";
import { ok, route, unauthorized } from "@/lib/http";

/**
 * Disparado 1x/dia pelo Vercel Cron (ver vercel.json). Autenticado por
 * CRON_SECRET: o Vercel manda `Authorization: Bearer $CRON_SECRET`
 * automaticamente em cron jobs — sem essa variável configurada, qualquer um
 * na internet poderia bater aqui e forçar a limpeza fora de hora.
 */
export const GET = route(async (req: NextRequest) => {
  if (env.cronSecret && req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    throw unauthorized();
  }
  const result = await cleanupExpiredPosts();
  return ok(result);
});
