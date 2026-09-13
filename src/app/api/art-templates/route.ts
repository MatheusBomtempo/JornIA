import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { artTemplateSchema } from "@/lib/validation";
import { created, ok, route } from "@/lib/http";

// GET /art-templates — templates disponíveis (por padrão só ativos)
export const GET = route(async (req: NextRequest) => {
  await requireUser();
  const includeInactive = new URL(req.url).searchParams.get("all") === "1";
  const templates = await prisma.artTemplate.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ templates });
});

// POST /art-templates — manager/admin cadastram template fixo
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  requireRole(user, "manager", "admin");
  const data = artTemplateSchema.parse(await req.json());

  const template = await prisma.artTemplate.create({
    data: {
      name: data.name,
      canvasWidth: data.canvasWidth,
      canvasHeight: data.canvasHeight,
      overlayAssetUrl: data.overlayAssetUrl,
      photoSlot: data.photoSlot,
      textSlot: data.textSlot,
      isActive: data.isActive ?? true,
    },
  });
  return created({ template });
});
