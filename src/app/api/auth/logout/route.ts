import { clearSessionCookie } from "@/lib/auth";
import { ok, route } from "@/lib/http";

export const POST = route(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
