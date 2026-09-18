import { type NextRequest } from "next/server";
import { requireCompanyUser, generateTempPassword, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { sendCredentialsEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import { createUserSchema } from "@/lib/validation";
import { conflict, created, forbidden, ok, route } from "@/lib/http";

// GET /users — manager/admin listam usuários
export const GET = route(async () => {
  const user = await requireCompanyUser();
  requireRole(user, "manager", "admin");
  const users = await prisma.user.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      passwordResetAt: true,
    },
  });
  return ok({ users });
});

// POST /users — manager/admin criam usuário. Manager só cria manager/staff —
// só admin promove admin (pedido explícito do dono do produto). Senha
// temporária ("sucessoNN") é sempre gerada no servidor e mandada por e-mail
// (login automático) — quem cria nunca digita nem vê a senha. A pessoa troca
// por uma própria depois de entrar (ver /api/auth/change-password).
export const POST = route(async (req: NextRequest) => {
  const actor = await requireCompanyUser();
  requireRole(actor, "manager", "admin");
  const data = createUserSchema.parse(await req.json());

  if (actor.role === "manager" && data.role === "admin") {
    throw forbidden("Gerente só pode criar contas de gerente ou jornalista.");
  }

  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict("Já existe um usuário com esse e-mail.");

  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      companyId: actor.companyId,
      passwordHash: await hashPassword(tempPassword),
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  // A conta já existe mesmo se o e-mail falhar (ex.: erro no envio via
  // Gmail) — não faz sentido travar a criação por causa disso. Quem criou
  // usa "Reenviar login" depois de resolver o problema.
  let emailSent = true;
  let emailError: string | undefined;
  try {
    await sendCredentialsEmail({ to: user.email, name: user.name, password: tempPassword });
    await prisma.user.update({ where: { id: user.id }, data: { passwordResetAt: new Date() } });
  } catch (err) {
    emailSent = false;
    emailError = (err as Error).message;
  }

  return created({ user, emailSent, emailError });
});
