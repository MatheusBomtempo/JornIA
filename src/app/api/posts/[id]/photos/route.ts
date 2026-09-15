import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { addPhotoSchema } from "@/lib/validation";
import { addPhotoToPost } from "@/lib/services/posts";
import { created, route } from "@/lib/http";

// POST /posts/:id/photos — anexa uma foto extra a um post já criado (o
// jornalista decidiu a foto depois de gerar o texto: achou uma melhor,
// baixou do Google Imagens ou de um banco gratuito a partir de uma sugestão).
export const POST = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = addPhotoSchema.parse(await req.json());
    const { photo, post } = await addPhotoToPost(user, id, input);
    return created({ photo, post });
  },
);
