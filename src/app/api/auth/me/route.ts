import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/http";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});
