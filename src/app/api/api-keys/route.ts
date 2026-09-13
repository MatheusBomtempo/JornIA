import { type NextRequest } from "next/server";
import { requireUser, generateApiKey } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createApiKeySchema } from "@/lib/validation";
import { created, ok, route } from "@/lib/http";

// GET /api-keys — admin lista chaves (sem expor o valor)
export const GET = route(async () => {
  const user = await requireUser();
  requireRole(user, "admin");
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return ok({ keys });
});

// POST /api-keys — admin cria chave; o valor em texto é retornado UMA vez
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  requireRole(user, "admin");
  const data = createApiKeySchema.parse(await req.json());

  const { plain, hash } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      name: data.name,
      scopes: data.scopes,
      keyHash: hash,
      createdBy: user.id,
    },
    select: { id: true, name: true, scopes: true, createdAt: true },
  });

  // `plain` só aparece aqui — não é possível recuperá-lo depois.
  return created({ key: { ...key, secret: plain } });
});
