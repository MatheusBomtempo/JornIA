import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { approveAndPublish } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// POST /posts/:id/versions/:vid/approve — aprova e publica no Instagram
export const POST = route(
  async (
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; vid: string }> },
  ) => {
    const user = await requireUser();
    const { id, vid } = await ctx.params;
    const post = await approveAndPublish(user, id, vid);
    return ok({ post });
  },
);
