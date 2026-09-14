"use client";

import { useEffect, useState } from "react";

/** Ícone girando — sinal visual de "ainda rodando", não travado. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Conta os segundos desde que `active` virou true — dá feedback tangível de
 * que a chamada está progredindo (e não travada), sem precisar abrir o
 * terminal pra ver log nenhum. Provedores gratuitos podem demorar bastante
 * (fila compartilhada) — isso avisa isso de forma explícita depois de um tempo.
 */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

/** Texto do botão com spinner + contador — usar dentro de um <button>. */
export function BusyLabel({ label, seconds }: { label: string; seconds: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner />
      <span>
        {label}
        {seconds >= 4 && <span className="tabular-nums opacity-75"> · {seconds}s</span>}
      </span>
    </span>
  );
}
