"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { useLocale } from "./LocaleProvider";

interface Props {
  postId: string;
  versionId: string;
  hasArt: boolean;
  alreadyApproved: boolean;
  /**
   * "overlay": chip discreto por cima da capa, só aparece no hover — pensado
   * pra desktop (mouse). "inline": sempre visível, botão maior, embaixo do
   * crédito — hover não existe em touch, e mobile é o uso principal do feed.
   */
  variant: "overlay" | "inline";
}

/**
 * Aprovar/recusar direto no card do feed, sem abrir o post. O card inteiro é
 * um <Link>, então todo clique aqui precisa parar propagação/navegação
 * (mesmo padrão do DeletePostButton).
 */
export function CardQuickActions({ postId, versionId, hasArt, alreadyApproved, variant }: Props) {
  const router = useRouter();
  const { dict } = useLocale();
  const t = dict.cardQuickActions;

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function approve(e: React.MouseEvent) {
    stop(e);
    if (busy) return;
    setBusy("approve");
    setError(null);
    try {
      await apiPost(`/api/posts/${postId}/versions/${versionId}/approve`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  function openReject(e: React.MouseEvent) {
    stop(e);
    setError(null);
    setRejecting(true);
  }

  function cancelReject(e: React.MouseEvent) {
    stop(e);
    setRejecting(false);
    setReason("");
    setError(null);
  }

  async function confirmReject(e: React.MouseEvent) {
    stop(e);
    if (reason.trim().length < 3 || busy) return;
    setBusy("reject");
    setError(null);
    try {
      await apiPost(`/api/posts/${postId}/versions/${versionId}/reject`, {
        reason: reason.trim(),
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const isOverlay = variant === "overlay";
  const forceVisible = rejecting || !!error;
  const approveTitle = !hasArt ? t.artNotReadyTitle : alreadyApproved ? t.alreadyApprovedTitle : undefined;

  const wrapperClass = isOverlay
    ? `absolute inset-x-0 top-0 z-[6] hidden justify-center rounded-t-2xl bg-gradient-to-b from-black/85 via-black/40 to-transparent px-3 pb-8 pt-3 transition-opacity duration-300 ease-out sm:flex ${
        forceVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      }`
    : "flex justify-center sm:hidden";

  const buttonSizing = isOverlay ? "h-8 text-xs" : "h-11 flex-1 justify-center rounded-xl text-sm";

  return (
    <div onClick={stop} className={wrapperClass}>
      {!rejecting ? (
        <div className={isOverlay ? "flex flex-col items-center gap-1.5" : "flex w-full gap-2"}>
          <div className={isOverlay ? "flex gap-2" : "flex w-full gap-2"}>
            <button
              type="button"
              onClick={approve}
              disabled={!hasArt || alreadyApproved || !!busy}
              title={approveTitle}
              className={`quick-action-approve ${buttonSizing}`}
            >
              {busy === "approve" ? t.approving : <>✅ {t.approve}</>}
            </button>
            <button
              type="button"
              onClick={openReject}
              disabled={!!busy}
              className={`quick-action-reject ${buttonSizing}`}
            >
              🚫 {t.reject}
            </button>
          </div>
          {isOverlay && error && <p className="text-[11px] font-medium text-red-300">{error}</p>}
        </div>
      ) : (
        <div
          className={`animate-fade-in space-y-1.5 rounded-xl border border-red-400/30 bg-black/70 p-2 backdrop-blur-md ${
            isOverlay ? "w-full max-w-[230px]" : "w-full"
          }`}
        >
          <input
            autoFocus
            value={reason}
            onClick={stop}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.reasonPlaceholder}
            className={`w-full rounded-lg border border-white/15 bg-white/5 text-white outline-none placeholder:text-white/40 focus:border-red-400/60 ${
              isOverlay ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm"
            }`}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={cancelReject}
              disabled={!!busy}
              className={`flex-1 rounded-lg font-medium text-white/70 transition hover:bg-white/10 disabled:opacity-40 ${
                isOverlay ? "py-1.5 text-[11px]" : "py-2.5 text-sm"
              }`}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={confirmReject}
              disabled={reason.trim().length < 3 || !!busy}
              className={`flex-1 rounded-lg bg-red-500/80 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                isOverlay ? "py-1.5 text-[11px]" : "py-2.5 text-sm"
              }`}
            >
              {busy === "reject" ? t.rejecting : t.confirmReject}
            </button>
          </div>
          {error && <p className="text-[11px] font-medium text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
