import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { styleReferenceSchema } from "@/lib/validation";
import { ok, route } from "@/lib/http";

// GET /style-reference — exemplo de estilo usado como referência pela IA
export const GET = route(async () => {
  await requireUser();
  const style = await prisma.styleReference.findUnique({ where: { id: 1 } });
  return ok({ style });
});

// PUT /style-reference — manager/admin editam o exemplo
export const PUT = route(async (req: NextRequest) => {
  const user = await requireUser();
  requireRole(user, "manager", "admin");
  const data = styleReferenceSchema.parse(await req.json());

  const style = await prisma.styleReference.upsert({
    where: { id: 1 },
    create: { id: 1, ...data, updatedBy: user.id },
    update: { ...data, updatedBy: user.id, updatedAt: new Date() },
  });
  return ok({ style });
});
