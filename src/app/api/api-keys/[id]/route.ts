import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/http";

// DELETE /api-keys/:id — admin revoga a chave (soft delete via revoked_at)
export const DELETE = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    requireRole(user, "admin");
    const { id } = await ctx.params;
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return ok({ ok: true });
  },
);
