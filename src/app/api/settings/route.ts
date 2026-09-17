import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { getAppSettings, updateAppSettings } from "@/lib/services/settings";
import { updateSettingsSchema } from "@/lib/validation";
import { ok, route } from "@/lib/http";

// GET /settings — qualquer usuário logado lê (o pipeline de posts consulta a flag)
export const GET = route(async () => {
  await requireUser();
  const settings = await getAppSettings();
  return ok({ settings });
});

// PATCH /settings — só admin liga/desliga o fluxo de aprovação
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser();
  requireRole(user, "admin");
  const input = updateSettingsSchema.parse(await req.json());
  const settings = await updateAppSettings(input);
  return ok({ settings });
});
