import { type NextRequest } from "next/server";
import { requireUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validation";
import { ok, route } from "@/lib/http";

/**
 * POST /auth/change-password — o próprio usuário logado troca a senha
 * (ex.: depois de entrar com a senha temporária "sucessoNN"). Zera
 * passwordResetAt: é o que faz a sugestão de troca sumir do app.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const { password } = changePasswordSchema.parse(await req.json());

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), passwordResetAt: null },
  });

  return ok({ ok: true });
});
