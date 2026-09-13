import { type NextRequest } from "next/server";
import { requireUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createUserSchema } from "@/lib/validation";
import { conflict, created, ok, route } from "@/lib/http";

// GET /users — admin lista usuários
export const GET = route(async () => {
  const user = await requireUser();
  requireRole(user, "admin");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
  return ok({ users });
});

// POST /users — admin cria usuário
export const POST = route(async (req: NextRequest) => {
  const admin = await requireUser();
  requireRole(admin, "admin");
  const data = createUserSchema.parse(await req.json());

  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict("Já existe um usuário com esse e-mail.");

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: await hashPassword(data.password),
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return created({ user });
});
