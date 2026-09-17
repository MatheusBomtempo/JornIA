import "server-only";
import { prisma } from "../db";

/** Linha única (id 1) — cria com os padrões na primeira leitura/escrita. */
export function getAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export function updateAppSettings(input: { reviewRequired: boolean }) {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: input,
    create: { id: 1, ...input },
  });
}
