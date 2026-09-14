import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { styleExampleSchema } from "@/lib/validation";
import { created, ok, route } from "@/lib/http";

// GET /style-examples — exemplos reais do jornal usados como referência pela IA
export const GET = route(async () => {
  await requireUser();
  const examples = await prisma.styleExample.findMany({
    orderBy: { orderIndex: "asc" },
  });
  return ok({ examples });
});

// POST /style-examples — manager/admin adicionam um exemplo
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  requireRole(user, "manager", "admin");
  const data = styleExampleSchema.parse(await req.json());

  const count = await prisma.styleExample.count();
  const example = await prisma.styleExample.create({
    data: {
      title: data.title ?? null,
      subtitle: data.subtitle ?? null,
      caption: data.caption ?? null,
      orderIndex: data.orderIndex ?? count,
      createdBy: user.id,
    },
  });
  return created({ example });
});
