import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPostSchema } from "@/lib/validation";
import { createPostWithAi, listPosts } from "@/lib/services/posts";
import { created, ok, route } from "@/lib/http";

// GET /posts — listagem (filtros: ?status=&mine=1)
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const mine = url.searchParams.get("mine") === "1";
  const posts = await listPosts({ status, mineFor: mine ? user.id : undefined });
  return ok({ posts });
});

// POST /posts — cria post e dispara o pipeline de IA (texto only)
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const input = createPostSchema.parse(await req.json());
  const post = await createPostWithAi(user, input);
  return created({ post });
});
