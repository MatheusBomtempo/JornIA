import "server-only";
import { env } from "../env";
import { ApiError } from "../http";

/**
 * Saldo de créditos do provedor de IA, lido direto na API do OpenRouter.
 *
 * Só o OpenRouter expõe isso por API (Groq, Gemini, OpenAI e Anthropic não
 * têm endpoint público de saldo) — como é ele que carrega a corrente hoje
 * (ver buildChain em ai/index.ts), o painel mostra o saldo sempre que houver
 * OPENROUTER_API_KEY, independente do AI_PROVIDER. Dois endpoints:
 *
 *   GET /credits   → total comprado e total gasto da CONTA (todas as chaves)
 *   GET /auth/key  → gasto desta CHAVE (hoje/semana/mês) e limite, se houver
 *
 * A chave é global (env), não por empresa — então todo admin vê o mesmo
 * saldo da instalação.
 */
export interface AiBalance {
  provider: "openrouter";
  /** Créditos comprados na conta, em USD. */
  totalCredits: number;
  /** Tudo que a conta já gastou, em USD (todas as chaves). */
  totalUsage: number;
  /** totalCredits - totalUsage (nunca negativo). */
  remaining: number;
  /** Consumo só desta chave (a que o JornAI usa), em USD. */
  key: {
    label: string;
    usage: number;
    usageDaily: number;
    usageWeekly: number;
    usageMonthly: number;
    /** Teto de gasto configurado na chave (null = sem teto). */
    limit: number | null;
    limitRemaining: number | null;
    isFreeTier: boolean;
    /** Cota diária de requisições a modelos ":free" (a corrente usa um como 3º elo). */
    freeModelDailyRequests: { used: number; limit: number; remaining: number } | null;
  };
  fetchedAt: string;
}

export type AiBalanceResult =
  | { supported: true; balance: AiBalance; cached: boolean }
  | { supported: false; provider: string };

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

let cache: { balance: AiBalance; at: number } | null = null;

export async function getAiBalance(opts: { fresh?: boolean } = {}): Promise<AiBalanceResult> {
  if (!env.ai.openrouterKey) {
    return { supported: false, provider: env.ai.provider };
  }

  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { supported: true, balance: cache.balance, cached: true };
  }

  const [credits, key] = await Promise.all([
    openrouterGet<{ total_credits: number; total_usage: number }>("/credits"),
    openrouterGet<OpenRouterKeyInfo>("/auth/key"),
  ]);

  const totalCredits = num(credits.total_credits);
  const totalUsage = num(credits.total_usage);
  const balance: AiBalance = {
    provider: "openrouter",
    totalCredits,
    totalUsage,
    remaining: Math.max(0, totalCredits - totalUsage),
    key: {
      label: key.label ?? "",
      usage: num(key.usage),
      usageDaily: num(key.usage_daily),
      usageWeekly: num(key.usage_weekly),
      usageMonthly: num(key.usage_monthly),
      limit: key.limit ?? null,
      limitRemaining: key.limit_remaining ?? null,
      isFreeTier: Boolean(key.is_free_tier),
      freeModelDailyRequests: key.free_model_daily_requests
        ? {
            used: num(key.free_model_daily_requests.used),
            limit: num(key.free_model_daily_requests.limit),
            remaining: num(key.free_model_daily_requests.remaining),
          }
        : null,
    },
    fetchedAt: new Date().toISOString(),
  };

  cache = { balance, at: Date.now() };
  return { supported: true, balance, cached: false };
}

interface OpenRouterKeyInfo {
  label?: string;
  usage?: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  limit?: number | null;
  limit_remaining?: number | null;
  is_free_tier?: boolean;
  free_model_daily_requests?: { used: number; limit: number; remaining: number };
}

async function openrouterGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.ai.openrouterBaseUrl.replace(/\/$/, "")}${path}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.ai.openrouterKey}` },
      cache: "no-store",
    });
  } catch (err) {
    const why =
      (err as Error).name === "AbortError"
        ? "tempo esgotado"
        : (err as Error).message;
    throw new ApiError(502, `OpenRouter não respondeu (${why}).`);
  } finally {
    clearTimeout(timeout);
  }

  const body = (await res.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;
  if (!res.ok || !body?.data) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(502, `OpenRouter recusou a consulta de saldo: ${msg}`);
  }
  return body.data;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
