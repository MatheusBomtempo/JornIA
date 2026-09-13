import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { ok, route, unauthorized } from "@/lib/http";

export const POST = route(async (req: NextRequest) => {
  const body = loginSchema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user || !user.active || !(await verifyPassword(body.password, user.passwordHash))) {
    throw unauthorized("E-mail ou senha inválidos.");
  }

  await setSessionCookie(user);
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});
