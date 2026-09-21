import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { addVideoSchema } from "@/lib/validation";
import { addVideoToPost } from "@/lib/services/posts";
import { created, route } from "@/lib/http";

// Extrai o frame do meio (ffmpeg) antes de responder — ver addVideoToPost.
export const maxDuration = 120;

// POST /posts/:id/videos — anexa um vídeo a um post (equivalente a /photos,
// pro post de vídeo em vez de foto).
export const POST = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    const { id } = await ctx.params;
    const input = addVideoSchema.parse(await req.json());
    const { video, previewError, post } = await addVideoToPost(user, id, input);
    return created({ video, previewError, post });
  },
);
