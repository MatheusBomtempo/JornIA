import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "./lib/i18n/config";
import { localeFromAcceptLanguage, localeFromCountry } from "./lib/i18n/detect";

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

  let response: NextResponse;

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    response = NextResponse.redirect(url);
  } else if (session && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  // Idioma da interface: só decide no 1º acesso (sem cookie ainda) — depois
  // disso, o valor gravado (detectado ou escolhido à mão) manda. Geo da
  // Vercel tem prioridade (só existe em deploy); Accept-Language cobre
  // localhost; sem sinal nenhum, cai em inglês (ver DEFAULT_LOCALE).
  if (!isLocale(req.cookies.get(LOCALE_COOKIE)?.value)) {
    const locale =
      localeFromCountry(req.headers.get("x-vercel-ip-country")) ??
      localeFromAcceptLanguage(req.headers.get("accept-language")) ??
      DEFAULT_LOCALE;
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  // Aplica a tudo, menos assets estáticos, uploads e as rotas de API.
  matcher: ["/((?!api|_next/static|_next/image|uploads|favicon.ico|.*\\.png$).*)"],
};
