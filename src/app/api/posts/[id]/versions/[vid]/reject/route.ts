import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { rejectSchema } from "@/lib/validation";
import { rejectPost } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// POST /posts/:id/versions/:vid/reject — recusa com motivo obrigatório
export const POST = route(
  async (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; vid: string }> },
  ) => {
    const user = await requireCompanyUser();
    const { id, vid } = await ctx.params;
    const { reason } = rejectSchema.parse(await req.json());
    const post = await rejectPost(user, id, vid, reason);
    return ok({ post });
  },
);
