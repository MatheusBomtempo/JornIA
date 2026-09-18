import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { artTemplateSchema } from "@/lib/validation";
import { sortTemplatesByFormat } from "@/lib/domain";
import { created, ok, route } from "@/lib/http";

// GET /art-templates — templates disponíveis (por padrão só ativos), 4:5 primeiro
export const GET = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  const includeInactive = new URL(req.url).searchParams.get("all") === "1";
  const templates = await prisma.artTemplate.findMany({
    where: includeInactive
      ? { companyId: user.companyId }
      : { companyId: user.companyId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ templates: sortTemplatesByFormat(templates) });
});

// POST /art-templates — qualquer papel autenticado cadastra template fixo
export const POST = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  const data = artTemplateSchema.parse(await req.json());

  const template = await prisma.artTemplate.create({
    data: {
      companyId: user.companyId,
      name: data.name,
      canvasWidth: data.canvasWidth,
      canvasHeight: data.canvasHeight,
      overlayAssetUrl: data.overlayAssetUrl,
      photoSlot: data.photoSlot,
      titleSlot: data.titleSlot,
      subtitleSlot: data.subtitleSlot ?? undefined,
      isActive: data.isActive ?? true,
    },
  });
  return created({ template });
});
