import { type NextRequest } from "next/server";
import { requireUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { updateUserSchema } from "@/lib/validation";
import { ok, route } from "@/lib/http";
import type { Prisma } from "@prisma/client";

// PATCH /users/:id — admin atualiza papel/status/senha
export const PATCH = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireUser();
    requireRole(admin, "admin");
    const { id } = await ctx.params;
    const data = updateUserSchema.parse(await req.json());

    const update: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.role !== undefined) update.role = data.role;
    if (data.active !== undefined) update.active = data.active;
    if (data.password !== undefined) {
      update.passwordHash = await hashPassword(data.password);
    }

    const user = await prisma.user.update({
      where: { id },
      data: update,
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return ok({ user });
  },
);
