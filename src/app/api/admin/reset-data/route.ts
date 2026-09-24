import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { resetDataSchema } from "@/lib/validation";
import { resetCompanyData } from "@/lib/services/data-reset";
import { ok, route } from "@/lib/http";

// Apaga arquivo por arquivo no storage antes das linhas do banco — com
// muitos posts/vídeos pode levar mais que o padrão.
export const maxDuration = 120;

// POST /admin/reset-data — só admin, só dados da própria empresa, e só com a
// palavra de confirmação no corpo (ver resetDataSchema): uma chamada
// acidental à API não apaga nada. Usuários e configuração ficam intactos
// (ver services/data-reset.ts).
export const POST = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  requireRole(user, "admin");
  const { scope } = resetDataSchema.parse(await req.json());
  const result = await resetCompanyData(user.companyId, scope);
  return ok(result);
});
