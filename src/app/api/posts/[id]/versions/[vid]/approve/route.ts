import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { approveAndPublish } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// Vídeo: o Instagram processa o container de forma assíncrona (polling de
// status_code) antes de publicar — pode levar bem mais que o padrão.
export const maxDuration = 290;

// POST /posts/:id/versions/:vid/approve — aprova e publica no Instagram
export const POST = route(
  async (
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; vid: string }> },
  ) => {
    const user = await requireCompanyUser();
    const { id, vid } = await ctx.params;
    const post = await approveAndPublish(user, id, vid);
    return ok({ post });
  },
);
