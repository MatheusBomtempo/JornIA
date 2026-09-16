import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env";
import type { UserRole } from "./domain";

/**
 * Assinatura/verificação de JWT de sessão usando `jose` — compatível com o
 * Edge Runtime (usado no middleware). NÃO importa bcrypt/Prisma de propósito.
 */

export const SESSION_COOKIE = "jornai_session";

export interface SessionPayload extends JWTPayload {
  sub: string; // user id
  name: string;
  email: string;
  role: UserRole;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret());
}

export interface SessionInput {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
}

export async function signSession(payload: SessionInput): Promise<string> {
  const ttl = env.authSessionTtl();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("jornai")
    .setExpirationTime(`${ttl}s`)
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "jornai",
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
