import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { regenerateSchema } from "@/lib/validation";
import { regeneratePost } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// Mesma corrente de IA de POST /posts — ver maxDuration lá pro motivo.
export const maxDuration = 60;

// POST /posts/:id/regenerate — novo ciclo de IA (nova versão, mesmas fotos)
export const POST = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    const { id } = await ctx.params;
    const body = regenerateSchema.parse(await req.json().catch(() => ({})));
    const result = await regeneratePost(user, id, body);
    return ok(result);
  },
);
