import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { poppinsFile } from "@/lib/render/text";
import type { Weight } from "@/lib/render/text-svg";
import { notFound, route } from "@/lib/http";

const WEIGHTS = new Set<Weight>([400, 600, 700]);

// GET /api/fonts/poppins/:weight — o MESMO .woff que o render do servidor
// usa, pro editor de arte montar o texto com as mesmas métricas (ver
// text-svg.ts). Pública (Poppins é OFL) e com cache longo: o arquivo só muda
// quando o pacote @fontsource muda.
export const GET = route(async (_req: Request, ctx: { params: Promise<{ weight: string }> }) => {
  const weight = Number((await ctx.params).weight) as Weight;
  if (!WEIGHTS.has(weight)) throw notFound("Peso de fonte indisponível.");
  const buf = await readFile(poppinsFile(weight));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "font/woff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
