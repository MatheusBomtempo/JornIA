import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

/**
 * Protege as páginas do app: sem sessão -> /login; com sessão -> não deixa
 * voltar pro /login. As rotas de API cuidam da própria auth (requireUser).
 */
const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Aplica a tudo, menos assets estáticos, uploads e as rotas de API.
  matcher: ["/((?!api|_next/static|_next/image|uploads|favicon.ico|.*\\.png$).*)"],
};
