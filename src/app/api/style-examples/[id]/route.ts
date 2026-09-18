import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { styleExampleSchema } from "@/lib/validation";
import { notFound, ok, route } from "@/lib/http";

async function assertOwnedExample(id: string, companyId: string) {
  const example = await prisma.styleExample.findUnique({ where: { id }, select: { companyId: true } });
  if (!example || example.companyId !== companyId) throw notFound("Exemplo não encontrado.");
}

// PATCH /style-examples/:id — edita um exemplo (qualquer papel autenticado)
export const PATCH = route(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    const { id } = await ctx.params;
    await assertOwnedExample(id, user.companyId);
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

// DELETE /style-examples/:id — remove um exemplo (qualquer papel autenticado)
export const DELETE = route(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCompanyUser();
    const { id } = await ctx.params;
    await assertOwnedExample(id, user.companyId);
    await prisma.styleExample.delete({ where: { id } });
    return ok({ ok: true });
  },
);
