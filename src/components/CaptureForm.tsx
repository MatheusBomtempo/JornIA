"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { CreditsInput } from "./CreditsInput";
import { BusyLabel, useElapsedSeconds } from "./Spinner";
import type { Credit } from "@/lib/domain";
import { clearDraft, loadDraft, saveDraft } from "@/lib/idb-draft";

const URL_ONLY = /^https?:\/\/\S+$/i;
const MAX_DOC_MB = 20;
const DRAFT_KEY = "capture-form";
const DRAFT_DEBOUNCE_MS = 300;

interface AttachedDoc {
  name: string;
  text: string;
  pages: number;
  chars: number;
  truncated: boolean;
}

interface CaptureDraft {
  content: string;
  doc: AttachedDoc | null;
  credits: Credit[];
}

/**
 * Passo 1 do fluxo (ver Stepper na página): o jornalista manda o que tem —
 * texto colado, link (detectado automaticamente) e/ou um documento (PDF de
 * boletim de ocorrência, nota oficial, matéria) — e já marca os créditos.
 * Ao enviar, a IA já gera o texto. A foto vira o passo 2, depois de gerado
 * o post — assim quem ainda não tem uma imagem não fica travado aqui.
 */
export function CaptureForm() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [doc, setDoc] = useState<AttachedDoc | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const [formDragging, setFormDragging] = useState(false);
  const docRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const trimmed = content.trim();
  const isLink = URL_ONLY.test(trimmed);
  const canSubmit = (trimmed.length > 0 || !!doc) && !busy && !extracting;
  const elapsed = useElapsedSeconds(!!busy);

  // Recupera o rascunho salvo — essencial no mobile: sair da aba (ou trocar
  // de app) costuma fazer o navegador descarregar esta página, e ao voltar
  // ela recarrega do zero perdendo tudo que estava só em memória.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraft<CaptureDraft>(DRAFT_KEY);
      if (!cancelled && draft) {
        if (draft.content) setContent(draft.content);
        if (draft.doc) setDoc(draft.doc);
        if (draft.credits?.length) setCredits(draft.credits);
        if (draft.content || draft.doc || draft.credits?.length) {
          setRestored(true);
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Salva o rascunho a cada mudança (com debounce) depois de hidratado, para
  // não sobrescrever um rascunho ainda não restaurado com o estado inicial vazio.
  useEffect(() => {
    if (!hydrated) return;
    if (!content.trim() && !doc && credits.length === 0) {
      clearDraft(DRAFT_KEY);
      return;
    }
    const timer = setTimeout(() => {
      saveDraft<CaptureDraft>(DRAFT_KEY, { content, doc, credits });
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, content, doc, credits]);

  const discardDraft = useCallback(() => {
    setContent("");
    setDoc(null);
    setCredits([]);
    setRestored(false);
    clearDraft(DRAFT_KEY);
  }, []);

  /** Envia o PDF/txt e recebe o texto já extraído. */
  const acceptDoc = useCallback(async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_DOC_MB * 1024 * 1024) {
      setError(`O documento passa de ${MAX_DOC_MB} MB.`);
      return;
    }
    setError(null);
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await apiPost<AttachedDoc>("/api/documents", fd);
      setDoc(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }, []);

  /**
   * Drop em qualquer ponto desta tela — não precisa mirar exatamente no
   * botão. A foto fica pro passo 2 (depois de gerar o texto), então uma
   * imagem solta aqui só avisa onde ela deve entrar.
   */
  const handleAutoDrop = useCallback(
    (f: File | undefined | null) => {
      if (!f) return;
      if (f.type === "application/pdf" || /\.(pdf|txt|md)$/i.test(f.name)) {
        acceptDoc(f);
      } else if (f.type.startsWith("image/")) {
        setError("A foto entra no próximo passo, depois de gerar o texto.");
      } else {
        setError("Arquivo não reconhecido. Envie um PDF, .txt ou .md.");
      }
    },
    [acceptDoc],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setBusy(isLink ? "Lendo o link e gerando o texto…" : "Gerando o texto com IA…");
      const { post } = await apiPost<{ post: { id: string } }>("/api/posts", {
        text: isLink || !trimmed ? undefined : trimmed,
        url: isLink ? trimmed : undefined,
        document: doc ? { name: doc.name, text: doc.text, pages: doc.pages } : undefined,
        credits: credits.filter((c) => c.handle.trim()),
      });
      clearDraft(DRAFT_KEY);
      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative space-y-4"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setFormDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setFormDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setFormDragging(false);
        handleAutoDrop(e.dataTransfer.files?.[0]);
      }}
    >
      {formDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-brand-500 bg-surface px-8 py-10 text-center shadow-glow">
            <p className="text-lg font-semibold text-ink">Solte o PDF aqui</p>
            <p className="mt-1 text-sm text-muted">A foto entra no próximo passo</p>
          </div>
        </div>
      )}

      {restored && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-200">
          <span>📝 Rascunho recuperado — o que você tinha preenchido continua aqui.</span>
          <button
            type="button"
            className="btn-ghost btn-sm shrink-0"
            onClick={discardDraft}
          >
            Descartar
          </button>
        </div>
      )}

      {/* O conteúdo */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">O que você apurou</h2>
            <p className="hint mt-0.5">
              Cole o texto, o link da matéria ou anexe um PDF (boletim de
              ocorrência, nota oficial). A IA lê tudo e entende o contexto.
            </p>
          </div>
          {trimmed.length > 0 && (
            <span
              className={`badge shrink-0 ${
                isLink
                  ? "bg-brand-500/15 text-brand-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {isLink ? "🔗 Link" : "📝 Texto"}
            </span>
          )}
        </div>

        <textarea
          className="input min-h-[9.5rem] resize-y leading-relaxed"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"Cole aqui o texto que você apurou…\n\nou apenas o link: https://…"}
          autoFocus
        />

        {isLink && (
          <p className="hint">Vamos abrir o link e extrair o conteúdo automaticamente.</p>
        )}

        {/* Documento anexado */}
        <div className="mt-3 border-t border-lineSoft pt-3">
          {doc ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
              <span className="text-lg leading-none" aria-hidden>📄</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="text-xs text-emerald-300">
                  texto extraído ✓ · {doc.pages} {doc.pages === 1 ? "página" : "páginas"} ·{" "}
                  {doc.chars.toLocaleString("pt-BR")} caracteres
                  {doc.truncated && " (cortado no limite)"}
                </p>
              </div>
              <button
                type="button"
                className="btn-danger btn-sm shrink-0"
                onClick={() => setDoc(null)}
              >
                Remover
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              disabled={extracting}
              className="btn-ghost w-full"
            >
              {extracting ? "Lendo o documento…" : "📎 Anexar documento (PDF) ou arraste aqui"}
            </button>
          )}
          <input
            ref={docRef}
            type="file"
            accept="application/pdf,.pdf,.txt,.md"
            className="hidden"
            onChange={(e) => acceptDoc(e.target.files?.[0])}
          />
          {!doc && !extracting && (
            <p className="hint">
              PDF com texto selecionável, até {MAX_DOC_MB} MB. Documento escaneado
              (foto do papel) não funciona.
            </p>
          )}
        </div>
      </section>

      {/* Créditos e marcações */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">
            Créditos e marcações{" "}
            <span className="font-normal text-muted">— opcional</span>
          </h2>
          <p className="hint mt-0.5">
            Quer marcar alguém? Diga o que a pessoa fez e informe o @. Entra no
            fim da legenda, antes das hashtags — ex.:{" "}
            <span className="text-ink">📸 @fotografo</span>
          </p>
        </div>
        <CreditsInput credits={credits} onChange={setCredits} />
      </section>

      {error && <p className="alert-error">{error}</p>}

      <div className="pt-1">
        <button type="submit" className="btn-primary w-full" disabled={!canSubmit}>
          {busy ? <BusyLabel label={busy} seconds={elapsed} /> : "Gerar texto com IA →"}
        </button>
        {busy && elapsed >= 8 && (
          <p className="mt-2 text-center text-xs text-muted">
            A IA gratuita às vezes demora — ainda estamos tentando, não recarregue a página.
          </p>
        )}
        {!busy && !trimmed && !doc && (
          <p className="mt-2 text-center text-xs text-faint">
            Cole um texto, um link ou anexe um PDF para continuar
          </p>
        )}
        {!busy && (trimmed || doc) && (
          <p className="mt-2 text-center text-xs text-faint">
            Depois você adiciona a foto e revisa antes de publicar.
          </p>
        )}
      </div>
    </form>
  );
}
