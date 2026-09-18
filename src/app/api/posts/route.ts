import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { createPostSchema } from "@/lib/validation";
import { createPostWithAi, listPosts } from "@/lib/services/posts";
import { maybeCleanupExpiredPosts } from "@/lib/services/retention";
import { created, ok, route } from "@/lib/http";

// POST pode rodar 2 passadas pela corrente de IA (validação + regeneração
// corretiva) — sem isso a função é morta pelo Vercel antes de terminar
// (502 sem log de erro nosso, visto em produção).
export const maxDuration = 60;

// GET /posts — listagem (filtros: ?status=&mine=1)
export const GET = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const mine = url.searchParams.get("mine") === "1";
  await maybeCleanupExpiredPosts();
  const posts = await listPosts(user.companyId, { status, mineFor: mine ? user.id : undefined });
  return ok({ posts });
});

// POST /posts — cria post e dispara o pipeline de IA (texto only)
export const POST = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  const input = createPostSchema.parse(await req.json());
  const post = await createPostWithAi(user, input);
  return created({ post });
});
