import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { saveArtSchema } from "@/lib/validation";
import { saveArtAndRender } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// POST /posts/:id/art — salva photo_transform + art_text e dispara o render (Sharp)
export const POST = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    const { id } = await ctx.params;
    const input = saveArtSchema.parse(await req.json());
    const post = await saveArtAndRender(user, id, input);
    return ok({ post });
  },
);
