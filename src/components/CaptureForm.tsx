"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import { CreditsInput } from "./CreditsInput";
import { BusyLabel, useElapsedSeconds } from "./Spinner";
import type { Credit } from "@/lib/domain";

const URL_ONLY = /^https?:\/\/\S+$/i;
const MAX_MB = 15;
const MAX_DOC_MB = 20;

interface AttachedDoc {
  name: string;
  text: string;
  pages: number;
  chars: number;
  truncated: boolean;
}

/**
 * Captura unificada: o jornalista joga tudo que tem numa tela só —
 * texto colado, link (detectado automaticamente) e/ou um documento
 * (PDF de boletim de ocorrência, nota oficial, matéria) + uma foto.
 */
export function CaptureForm() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [doc, setDoc] = useState<AttachedDoc | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const trimmed = content.trim();
  const isLink = URL_ONLY.test(trimmed);
  const canSubmit = (trimmed.length > 0 || !!doc) && !busy && !extracting;
  const elapsed = useElapsedSeconds(!!busy);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Aqui só entra imagem. Para PDF, use “Anexar documento” no passo 1.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`A imagem passa de ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setFile(f);
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

  // Colar imagem direto do clipboard (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (img) {
        e.preventDefault();
        acceptFile(img);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFile]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      let photo: { storageUrl: string } | undefined;
      if (file) {
        setBusy("Enviando a foto…");
        const fd = new FormData();
        fd.append("file", file);
        const up = await apiPost<{ url: string }>("/api/upload", fd);
        photo = { storageUrl: up.url };
      }
      setBusy(isLink ? "Lendo o link e gerando o texto…" : "Gerando o texto com IA…");
      const { post } = await apiPost<{ post: { id: string } }>("/api/posts", {
        text: isLink || !trimmed ? undefined : trimmed,
        url: isLink ? trimmed : undefined,
        document: doc ? { name: doc.name, text: doc.text, pages: doc.pages } : undefined,
        photo,
        credits: credits.filter((c) => c.handle.trim()),
      });
      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* 1. O conteúdo */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">1. O que você apurou</h2>
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

        {/* Documento anexado — colado ao passo 1 */}
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
              {extracting ? "Lendo o documento…" : "📎 Anexar documento (PDF)"}
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

      {/* 2. A foto */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">
            2. A foto <span className="font-normal text-muted">— vira a arte do post</span>
          </h2>
          <p className="hint mt-0.5">
            Uma foto por post. Você ajusta o enquadramento no passo seguinte.
          </p>
        </div>

        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Pré-visualização da foto"
              className="max-h-72 w-full bg-black object-contain"
            />
            <div className="flex items-center justify-between gap-2 border-t border-line bg-elevated px-3 py-2">
              <span className="truncate text-xs text-muted">{file?.name}</span>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-ghost btn-sm"
                  onClick={() => fileRef.current?.click()}>
                  Trocar
                </button>
                <button type="button" className="btn-danger btn-sm"
                  onClick={() => setFile(null)}>
                  Remover
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl
                        border-2 border-dashed px-4 py-8 text-center transition-colors ${
                          dragging
                            ? "border-brand-500 bg-brand-500/10"
                            : "border-line bg-elevated/60 hover:border-brand-500/60"
                        }`}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-brand-400"
              />
            </svg>
            <p className="text-sm font-medium">
              Arraste a foto, cole (Ctrl+V) ou toque para escolher
            </p>
            <p className="text-xs text-muted">JPEG, PNG ou WebP · até {MAX_MB} MB</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="btn-ghost mt-3 w-full sm:hidden"
        >
          📷 Tirar foto agora
        </button>

        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
          className="hidden" onChange={(e) => acceptFile(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={(e) => acceptFile(e.target.files?.[0])} />

        {!file && canSubmit && (
          <p className="hint">
            Sem foto você ainda gera o texto, mas não dá pra montar a arte.
          </p>
        )}
      </section>

      {/* 3. Créditos e marcações */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">
            3. Créditos e marcações{" "}
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
          {busy ? <BusyLabel label={busy} seconds={elapsed} /> : "Gerar post com IA"}
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
      </div>
    </form>
  );
}
