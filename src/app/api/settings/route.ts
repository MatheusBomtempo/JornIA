import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { getAppSettings, updateAppSettings } from "@/lib/services/settings";
import { updateSettingsSchema } from "@/lib/validation";
import { ok, route } from "@/lib/http";

// GET /settings — qualquer usuário logado lê (o pipeline de posts consulta a flag)
export const GET = route(async () => {
  const user = await requireCompanyUser();
  const settings = await getAppSettings(user.companyId);
  return ok({ settings });
});

// PATCH /settings — só admin liga/desliga o fluxo de aprovação
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  requireRole(user, "admin");
  const input = updateSettingsSchema.parse(await req.json());
  const settings = await updateAppSettings(user.companyId, input);
  return ok({ settings });
});
