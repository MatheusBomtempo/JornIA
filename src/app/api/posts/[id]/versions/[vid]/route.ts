import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { editVersionSchema } from "@/lib/validation";
import { editVersionManually } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// PATCH /posts/:id/versions/:vid — edição manual de texto (gera nova versão)
export const PATCH = route(
  async (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; vid: string }> },
  ) => {
    const user = await requireUser();
    const { id, vid } = await ctx.params;
    const input = editVersionSchema.parse(await req.json());
    const result = await editVersionManually(user, id, vid, input);
    return ok(result);
  },
);
