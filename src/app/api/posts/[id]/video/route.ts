import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { saveVideoSchema } from "@/lib/validation";
import { saveVideoAndRender } from "@/lib/services/posts";
import { ok, route } from "@/lib/http";

// ffmpeg reencoda o vídeo inteiro — bem mais lento que o render de imagem
// (Sharp). Pode ainda auto-publicar (revisão desligada), que soma o tempo
// de espera do processamento do vídeo no Instagram.
export const maxDuration = 290;

// POST /posts/:id/video — salva o vídeo escolhido + título e dispara o
// render final (cartão de título com animação, via ffmpeg) — equivalente a
// /art, mas para posts de vídeo em vez de foto.
export const POST = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    const { id } = await ctx.params;
    const input = saveVideoSchema.parse(await req.json());
    const post = await saveVideoAndRender(user, id, input);
    return ok({ post });
  },
);
