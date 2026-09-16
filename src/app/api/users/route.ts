import { type NextRequest } from "next/server";
import { requireUser, generateTempPassword, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { sendCredentialsEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import { createUserSchema } from "@/lib/validation";
import { conflict, created, forbidden, ok, route } from "@/lib/http";

// GET /users — manager/admin listam usuários
export const GET = route(async () => {
  const user = await requireUser();
  requireRole(user, "manager", "admin");
  const users = await prisma.user.findMany({
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
// só admin promove admin (pedido explícito do dono do produto). Senha é
// sempre gerada forte no servidor e mandada por e-mail (login automático)
// — quem cria nunca digita nem vê a senha.
export const POST = route(async (req: NextRequest) => {
  const actor = await requireUser();
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
      passwordHash: await hashPassword(tempPassword),
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  // A conta já existe mesmo se o e-mail falhar (ex.: destinatário fora do
  // sandbox do Resend) — não faz sentido travar a criação por causa disso.
  // Quem criou usa "Reenviar login" depois de resolver o e-mail.
  let emailSent = true;
  let emailError: string | undefined;
  let deliveredTo: string | undefined;
  try {
    ({ deliveredTo } = await sendCredentialsEmail({
      to: user.email,
      name: user.name,
      password: tempPassword,
    }));
    await prisma.user.update({ where: { id: user.id }, data: { passwordResetAt: new Date() } });
  } catch (err) {
    emailSent = false;
    emailError = (err as Error).message;
  }

  return created({ user, emailSent, emailError, deliveredTo });
});
