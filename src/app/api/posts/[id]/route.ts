import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPostDetail, deletePostNow } from "@/lib/services/posts";
import { notFound, ok, route } from "@/lib/http";

// GET /posts/:id — detalhe com versões, decisões e publicações
export const GET = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireUser();
    const { id } = await ctx.params;
    const post = await getPostDetail(id);
    if (!post) throw notFound("Post não encontrado.");
    return ok({ post });
  },
);

// DELETE /posts/:id — admin apaga a pauta agora, independente do status
export const DELETE = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deletePostNow(user, id);
    return ok({ deleted: true });
  },
);
