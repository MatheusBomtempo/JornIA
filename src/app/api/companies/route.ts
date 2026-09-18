import { type NextRequest } from "next/server";
import { requireUser, requireCompanyUser, setSessionCookie } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { createCompanySchema, updateCompanySchema } from "@/lib/validation";
import { createCompanyForUser, getCompany, updateCompany } from "@/lib/services/company";
import { created, ok, route } from "@/lib/http";

// GET /companies — dados da empresa do usuário logado (Admin → Empresa).
export const GET = route(async () => {
  const user = await requireCompanyUser();
  const company = await getCompany(user.companyId);
  return ok({ company });
});

// POST /companies — onboarding: admin sem empresa cadastra a dele. Reemite o
// cookie de sessão com o companyId novo, senão o middleware manda a pessoa
// de volta pro onboarding no próximo request (o JWT antigo não tinha essa claim).
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  requireRole(user, "admin");
  const input = createCompanySchema.parse(await req.json());

  const { company, user: updatedUser } = await createCompanyForUser(user, input);
  await setSessionCookie(updatedUser);

  return created({ company });
});

// PATCH /companies — admin edita nome/logo/@ da própria empresa.
export const PATCH = route(async (req: NextRequest) => {
  const user = await requireCompanyUser();
  requireRole(user, "admin");
  const input = updateCompanySchema.parse(await req.json());
  const company = await updateCompany(user.companyId, input);
  return ok({ company });
});
