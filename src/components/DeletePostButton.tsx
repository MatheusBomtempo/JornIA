"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiDelete } from "@/lib/api-client";

/**
 * Botão de apagar direto no card do feed. O card inteiro é um <Link>, então
 * todo clique aqui (botão e modal) precisa parar propagação/navegação.
 * Sempre visível (não só no hover) de propósito — hover não existe em touch,
 * e mobile é o uso principal do feed.
 */
export function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setOpen(true);
  }

  function stop(e: React.MouseEvent | React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function confirmDelete(e: React.MouseEvent) {
    stop(e);
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/posts/${postId}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        title="Apagar pauta"
        aria-label="Apagar pauta"
        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-red-500/90 text-white shadow-soft ring-1 ring-inset ring-red-400/40 transition-colors hover:bg-red-600 active:bg-red-700"
      >
        <TrashIcon />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 sm:items-center"
            onClick={(e) => {
              stop(e);
              if (!busy) setOpen(false);
            }}
          >
            <div
              className="card w-full max-w-sm p-5"
              onClick={stop}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-post-title"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30">
                <TrashIcon />
              </div>
              <h2 id="delete-post-title" className="text-base font-semibold text-ink">
                Apagar esta pauta?
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                Some do feed e do storage agora mesmo — foto, arte e histórico. Não dá
                pra desfazer.
              </p>
              {error && <p className="alert-error mt-3">{error}</p>}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={(e) => {
                    stop(e);
                    setOpen(false);
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn bg-red-600 text-white hover:bg-red-500 active:bg-red-700"
                  onClick={confirmDelete}
                  disabled={busy}
                >
                  {busy ? "Apagando…" : "Apagar pauta"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M4 6h12M8.5 6V4.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V6M6 6l.6 9.4A1.5 1.5 0 0 0 8.1 17h3.8a1.5 1.5 0 0 0 1.5-1.6L14 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
