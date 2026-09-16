import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { env } from "./env";
import { unauthorized } from "./http";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./session";
import type { User } from "@prisma/client";

const BCRYPT_ROUNDS = 10;

// ── Senhas ───────────────────────────────────────────────────
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Cookie de sessão ─────────────────────────────────────────
export async function setSessionCookie(user: User): Promise<void> {
  const token = await signSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: env.authSessionTtl(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Lê a sessão do cookie (sem tocar no banco). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Carrega o usuário logado a partir da sessão + banco. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session?.sub) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.active) return null;
  return user;
}

/** Igual a getCurrentUser, mas lança 401 se não houver usuário. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** Senha temporária forte, pra reset feito por admin/manager (ver /users/:id/reset-password). */
export function generateTempPassword(): string {
  return randomBytes(12).toString("base64url"); // 16 chars, sem ambiguidade
}

// ── API keys ─────────────────────────────────────────────────
const API_KEY_PREFIX = "jrn_";

/** Gera uma nova chave (mostrada uma única vez) + seu hash pra guardar. */
export function generateApiKey(): { plain: string; hash: string } {
  const plain = API_KEY_PREFIX + randomBytes(24).toString("hex");
  return { plain, hash: hashApiKey(plain) };
}

/** Hash determinístico (SHA-256) pra lookup rápido de API key. */
export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}
