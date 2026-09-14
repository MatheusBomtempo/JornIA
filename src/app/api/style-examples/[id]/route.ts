import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { styleExampleSchema } from "@/lib/validation";
import { ok, route } from "@/lib/http";

// PATCH /style-examples/:id — edita um exemplo
export const PATCH = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    requireRole(user, "manager", "admin");
    const { id } = await ctx.params;
    const data = styleExampleSchema.parse(await req.json());

    const example = await prisma.styleExample.update({
      where: { id },
      data: {
        title: data.title ?? null,
        subtitle: data.subtitle ?? null,
        caption: data.caption ?? null,
      },
    });
    return ok({ example });
  },
);

// DELETE /style-examples/:id — remove um exemplo
export const DELETE = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    requireRole(user, "manager", "admin");
    const { id } = await ctx.params;
    await prisma.styleExample.delete({ where: { id } });
    return ok({ ok: true });
  },
);
