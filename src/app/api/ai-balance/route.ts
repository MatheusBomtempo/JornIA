import { type NextRequest } from "next/server";
import { requireCompanyUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { getAiBalance } from "@/lib/services/ai-balance";
import { ok, route } from "@/lib/http";

// GET /ai-balance — saldo de créditos do provedor de IA (só admin).
// Cache de 60s no servidor; ?fresh=1 força consulta nova (botão "Atualizar").
export const GET = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  requireRole(user, "admin");
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  return ok(await getAiBalance({ fresh }));
});
