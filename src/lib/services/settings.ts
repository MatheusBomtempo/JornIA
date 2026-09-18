import "server-only";
import { prisma } from "../db";

/** 1 linha por empresa — cria com os padrões na primeira leitura/escrita. */
export function getAppSettings(companyId: string) {
  return prisma.appSettings.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });
}

export function updateAppSettings(companyId: string, input: { reviewRequired: boolean }) {
  return prisma.appSettings.upsert({
    where: { companyId },
    update: input,
    create: { companyId, ...input },
  });
}
