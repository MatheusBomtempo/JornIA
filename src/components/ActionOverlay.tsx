"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Spinner, useElapsedSeconds } from "./Spinner";
import { useLocale } from "./LocaleProvider";

/** Sucesso fica na tela este tempo antes de fechar sozinho. */
const SUCCESS_AUTO_CLOSE_MS = 1800;
/** A partir daqui avisa que está demorando mais que o normal. */
const SLOW_AFTER_SECONDS = 8;

type Status = "loading" | "success" | "error";

interface LogEntry {
  id: number;
  /** ms desde o início desta tentativa. */
  at: number;
  text: string;
}

interface OverlayState {
  status: Status;
  /** O que está sendo feito — "Gerando o texto com IA…". */
  title: string;
  attempt: number;
  log: LogEntry[];
  /** Mensagem de sucesso; null usa o padrão do dicionário. */
  successMessage: string | null;
  /** Se 0, não fecha sozinho — espera navegação ou toque. */
  successDelayMs: number;
  error: string | null;
  /** ms desde o início até terminar (sucesso ou erro) — timestamp da última linha do log. */
  finishedAt: number | null;
  /** Barra de progresso (upload): fração 0–1 e um detalhe tipo "12,4 MB de 48 MB". */
  progress: { ratio: number; detail: string | null } | null;
}

export interface RunContext {
  /** Registra um passo intermediário no log ("Vídeo no servidor — gerando a prévia…"). */
  log: (text: string) => void;
  /**
   * Mostra/atualiza a barra de progresso (fração 0–1) com um detalhe
   * opcional; `null` esconde a barra (ex.: upload acabou, servidor processando).
   */
  progress: (ratio: number | null, detail?: string) => void;
}

export interface RunOptions<T> {
  /** Título mostrado enquanto roda. Vira a 1ª linha do log. */
  title: string;
  /** Mensagem quando dá certo. Sem ela, "Pronto!". */
  success?: string;
  /**
   * Tempo que o sucesso fica na tela antes de fechar sozinho. 0 = não fecha
   * por tempo (fecha quando a rota muda ou a pessoa toca) — útil quando a
   * ação termina navegando pra outra página.
   */
  successDelayMs?: number;
  /** A ação em si. Recebe `log`/`progress` pra detalhar o andamento. */
  fn: (ctx: RunContext) => Promise<T>;
}

export type RunResult<T> = { ok: true; value: T } | { ok: false };

interface ActionOverlayContextValue {
  /**
   * Roda a ação mostrando o modal. Só resolve quando termina de verdade:
   * `{ ok: true }` no sucesso (inclusive depois de "Tentar de novo") ou
   * `{ ok: false }` se a pessoa fechou o erro sem tentar de novo.
   */
  run: <T>(opts: RunOptions<T>) => Promise<RunResult<T>>;
  /** Fecha o modal na hora (só fora do loading). */
  close: () => void;
}

const ActionOverlayContext = createContext<ActionOverlayContextValue | null>(null);

let logSeq = 0;

/**
 * Feedback único pra toda ação que avança o fluxo (gerar texto, gerar
 * arte/vídeo, aprovar, recusar, reescrever): um modal sobre a tela inteira
 * com loading + contador, um log do que aconteceu e o resultado — sucesso
 * ou o erro por inteiro. Fica montado no layout raiz, então sobrevive ao
 * unmount do componente que disparou (o ArtEditor some quando o post vai
 * pra revisão) e à navegação (CaptureForm → /posts/:id).
 *
 * Nasceu pro mobile: o spinner dentro do botão e o alert embaixo dele
 * ficam fora da vista quando o botão está no fim da página — o modal não.
 */
export function ActionOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OverlayState | null>(null);
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Enquanto o erro está na tela, `run` fica esperando a decisão da pessoa.
  const decisionRef = useRef<((choice: "retry" | "close") => void) | null>(null);

  const clearTimer = () => {
    if (autoCloseTimer.current) {
      clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }
  };

  const close = useCallback(() => {
    clearTimer();
    if (decisionRef.current) {
      // O `run` está parado no erro — quem limpa o estado é ele.
      decisionRef.current("close");
      return;
    }
    setState((s) => (s && s.status !== "loading" ? null : s));
  }, []);

  const retry = useCallback(() => {
    decisionRef.current?.("retry");
  }, []);

  const run = useCallback(async <T,>(opts: RunOptions<T>): Promise<RunResult<T>> => {
    const successDelayMs = opts.successDelayMs ?? SUCCESS_AUTO_CLOSE_MS;
    clearTimer();

    for (let attempt = 1; ; attempt++) {
      const startedAt = Date.now();
      const entry = (text: string): LogEntry => ({
        id: ++logSeq,
        at: Date.now() - startedAt,
        text,
      });
      const ctx: RunContext = {
        log: (text) => setState((s) => (s ? { ...s, log: [...s.log, entry(text)] } : s)),
        progress: (ratio, detail) =>
          setState((s) =>
            s
              ? {
                  ...s,
                  progress:
                    ratio === null
                      ? null
                      : { ratio: Math.min(1, Math.max(0, ratio)), detail: detail ?? null },
                }
              : s,
          ),
      };

      setState({
        status: "loading",
        title: opts.title,
        attempt,
        log: [entry(opts.title)],
        successMessage: opts.success ?? null,
        successDelayMs,
        error: null,
        finishedAt: null,
        progress: null,
      });

      try {
        const value = await opts.fn(ctx);
        const finishedAt = Date.now() - startedAt;
        setState((s) => (s ? { ...s, status: "success", finishedAt, progress: null } : s));
        if (successDelayMs > 0) {
          autoCloseTimer.current = setTimeout(() => {
            autoCloseTimer.current = null;
            setState(null);
          }, successDelayMs);
        }
        return { ok: true, value };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const finishedAt = Date.now() - startedAt;
        setState((s) =>
          s ? { ...s, status: "error", error: message, finishedAt, progress: null } : s,
        );
        const choice = await new Promise<"retry" | "close">((resolve) => {
          decisionRef.current = resolve;
        });
        decisionRef.current = null;
        if (choice === "close") {
          setState(null);
          return { ok: false };
        }
      }
    }
  }, []);

  // Sucesso que ficou esperando navegação (successDelayMs = 0): a página
  // nova chegou, pode fechar.
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    setState((s) => (s && s.status === "success" ? null : s));
  }, [pathname]);

  useEffect(() => clearTimer, []);

  const elapsed = useElapsedSeconds(state?.status === "loading");

  return (
    <ActionOverlayContext.Provider value={{ run, close }}>
      {children}
      {state && (
        <ActionOverlayDialog state={state} elapsed={elapsed} onClose={close} onRetry={retry} />
      )}
    </ActionOverlayContext.Provider>
  );
}

export function useActionOverlay(): ActionOverlayContextValue {
  const ctx = useContext(ActionOverlayContext);
  if (!ctx) throw new Error("useActionOverlay must be used within ActionOverlayProvider");
  return ctx;
}

// ── UI ────────────────────────────────────────────────────────

function ActionOverlayDialog({
  state,
  elapsed,
  onClose,
  onRetry,
}: {
  state: OverlayState;
  elapsed: number;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { dict } = useLocale();
  const t = dict.actionOverlay;
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLLIElement>(null);
  const loading = state.status === "loading";

  // Trava o scroll da página por baixo — no mobile o dedo escorrega fácil
  // pro conteúdo de trás e a pessoa perde o modal de vista.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Foco: entra no diálogo ao abrir (leitor de tela anuncia); quando termina,
  // vai pro botão principal pra dar pra seguir só com Enter.
  useEffect(() => {
    if (loading) dialogRef.current?.focus();
    else primaryRef.current?.focus();
  }, [loading]);

  // Enquanto roda, acompanha as linhas novas; quando termina, mostra o
  // COMEÇO do resultado — num erro longo (stderr do ffmpeg) a 1ª linha é a
  // que explica, o resto é detalhe pra quem quiser rolar.
  useEffect(() => {
    if (state.status === "loading") logEndRef.current?.scrollIntoView({ block: "nearest" });
    else resultRef.current?.scrollIntoView({ block: "start" });
  }, [state.log.length, state.status]);

  useEffect(() => {
    if (loading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onClose]);

  const heading =
    state.status === "loading"
      ? state.title
      : state.status === "success"
        ? (state.successMessage ?? t.successDefault)
        : t.errorTitle;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4
                 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]
                 backdrop-blur-sm animate-fade-in"
      onClick={() => !loading && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-busy={loading}
        aria-live="assertive"
        aria-labelledby="action-overlay-title"
        aria-describedby="action-overlay-log"
        onClick={(e) => e.stopPropagation()}
        className={`card flex max-h-[min(85dvh,36rem)] w-full max-w-sm flex-col p-5 outline-none sm:p-6 ${
          state.status === "error"
            ? "border-red-500/40"
            : state.status === "success"
              ? "border-emerald-500/40"
              : "shadow-glow"
        }`}
      >
        {/* Cabeçalho: ícone grande + o que está acontecendo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <StatusIcon status={state.status} />
          <h2 id="action-overlay-title" className="text-base font-semibold leading-snug text-ink">
            {heading}
          </h2>
          {loading && (
            <p className="text-xs tabular-nums text-muted">{elapsed}s</p>
          )}
          {loading && state.progress && (
            <ProgressBar ratio={state.progress.ratio} detail={state.progress.detail} />
          )}
          {loading && elapsed >= SLOW_AFTER_SECONDS && (
            <p className="text-xs text-muted animate-fade-in">{t.slowHint}</p>
          )}
        </div>

        {/* Log — única área que rola, pra caber erro longo (stderr do ffmpeg) */}
        <div
          id="action-overlay-log"
          className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-lineSoft bg-elevated p-3"
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
            {t.logHeading}
            {state.attempt > 1 && <span> · {t.attempt.replace("{n}", String(state.attempt))}</span>}
          </p>
          <ol className="space-y-1 text-xs">
            {state.log.map((l) => (
              <li key={l.id} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-faint">{formatAt(l.at)}</span>
                <span className="min-w-0 break-words text-muted">{l.text}</span>
              </li>
            ))}
            {state.status === "success" && (
              <li ref={resultRef} className="flex gap-2 text-emerald-300">
                <span className="shrink-0 tabular-nums text-faint">{formatAt(state.finishedAt ?? 0)}</span>
                <span aria-hidden className="shrink-0">✓</span>
                <span className="min-w-0 break-words">{state.successMessage ?? t.successDefault}</span>
              </li>
            )}
            {state.status === "error" && (
              <li ref={resultRef} className="flex gap-2 text-red-300">
                <span className="shrink-0 tabular-nums text-faint">{formatAt(state.finishedAt ?? 0)}</span>
                <span aria-hidden className="shrink-0">✕</span>
                <pre className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words font-sans">
                  {state.error}
                </pre>
              </li>
            )}
          </ol>
          <div ref={logEndRef} />
        </div>

        {/* Ações */}
        {loading && state.progress ? (
          // Upload: quem trabalha é o aparelho — sair do app congela/derruba o
          // envio e ele recomeça do zero. Na fase do servidor (sem barra) o
          // aviso genérico basta, o trabalho continua sem o celular.
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200"
          >
            <span aria-hidden className="shrink-0">⚠️</span>
            <span>{t.uploadWarning}</span>
          </p>
        ) : loading ? (
          <p className="mt-4 text-center text-xs text-faint">{t.dontClose}</p>
        ) : null}
        {state.status === "success" && (
          <button ref={primaryRef} type="button" className="btn-primary mt-4 w-full" onClick={onClose}>
            {t.continue}
          </button>
        )}
        {state.status === "error" && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {t.close}
            </button>
            <button ref={primaryRef} type="button" className="btn-primary" onClick={onRetry}>
              {t.retry}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "loading") {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  if (status === "success") {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 animate-fade-in">
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30 animate-fade-in">
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Barra de upload — porcentagem grande o bastante pra ler no celular sem óculos. */
function ProgressBar({ ratio, detail }: { ratio: number; detail: string | null }) {
  const pct = Math.round(ratio * 100);
  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-muted">
        <span className="font-semibold text-ink">{pct}%</span>
        {detail && <span> · {detail}</span>}
      </p>
    </div>
  );
}

function formatAt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
