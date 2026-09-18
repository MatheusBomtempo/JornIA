import "server-only";
import { prisma } from "../db";
import { conflict } from "../http";
import { normalizeHandle } from "../domain";
import type { User } from "@prisma/client";

interface CreateCompanyInput {
  name: string;
  logoUrl?: string;
  instagramHandle?: string;
}

/**
 * Onboarding: o admin recém-logado (sem empresa ainda) cadastra a empresa
 * e já vira o primeiro membro dela. Um usuário só pode fazer isso uma vez —
 * depois, é o admin quem convida o resto do time (ver /api/users).
 */
export async function createCompanyForUser(user: User, input: CreateCompanyInput) {
  if (user.companyId) throw conflict("Você já tem uma empresa cadastrada.");

  const company = await prisma.company.create({
    data: {
      name: input.name,
      logoUrl: input.logoUrl ?? null,
      instagramHandle: input.instagramHandle ? normalizeHandle(input.instagramHandle) : null,
    },
  });

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { companyId: company.id },
  });

  return { company, user: updatedUser };
}

interface UpdateCompanyInput {
  name?: string;
  logoUrl?: string | null;
  instagramHandle?: string | null;
}

/** Admin ajusta nome/logo/@ depois do onboarding (ver Admin → Empresa). */
export function updateCompany(companyId: string, input: UpdateCompanyInput) {
  return prisma.company.update({
    where: { id: companyId },
    data: {
      name: input.name,
      logoUrl: input.logoUrl,
      instagramHandle:
        input.instagramHandle === undefined
          ? undefined
          : input.instagramHandle
            ? normalizeHandle(input.instagramHandle)
            : null,
    },
  });
}

export function getCompany(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId } });
}
