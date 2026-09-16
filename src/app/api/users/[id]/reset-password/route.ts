import { type NextRequest } from "next/server";
import { requireUser, generateTempPassword, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { sendCredentialsEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import { badRequest, notFound, ok, route } from "@/lib/http";

/**
 * POST /users/:id/reset-password — manager/admin geram uma senha nova pro
 * usuário e mandam por e-mail (Gmail). Ninguém vê a senha na tela — nem
 * quem disparou o reset: ela só existe em memória o tempo de gerar o hash
 * e montar o e-mail, nunca é salva em texto puro nem devolvida na resposta.
 */
export const POST = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    requireRole(actor, "manager", "admin");
    const { id } = await ctx.params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    });
    if (!target) throw notFound("Usuário não encontrado.");

    const tempPassword = generateTempPassword();
    const passwordResetAt = new Date();

    try {
      await sendCredentialsEmail({
        to: target.email,
        name: target.name,
        password: tempPassword,
      });
    } catch (err) {
      // Motivo real na tela pra quem disparou (é sempre admin/manager, não
      // tem risco de vazar detalhe interno pra alguém sem permissão) — sem
      // isso só dava pra saber a causa lendo o log do servidor.
      throw badRequest(`Falha ao enviar e-mail: ${(err as Error).message}`);
    }

    // Só atualiza o hash DEPOIS do e-mail sair — se o envio falhar, a senha
    // antiga continua valendo (evita trocar acesso sem a pessoa saber a nova).
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(tempPassword),
        passwordResetAt,
      },
    });

    return ok({ sentAt: passwordResetAt.toISOString() });
  },
);
