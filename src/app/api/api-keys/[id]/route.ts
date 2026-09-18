import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notFound, ok, route } from "@/lib/http";

// DELETE /api-keys/:id — admin revoga a chave (soft delete via revoked_at)
export const DELETE = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    requireRole(user, "admin");
    const { id } = await ctx.params;
    const key = await prisma.apiKey.findUnique({ where: { id }, select: { companyId: true } });
    if (!key || key.companyId !== user.companyId) throw notFound("Chave não encontrada.");
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return ok({ ok: true });
  },
);
