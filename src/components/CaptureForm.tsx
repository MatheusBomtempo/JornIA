"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";
import type { SourceType } from "@/lib/domain";

const TABS: { value: SourceType; label: string; hint: string }[] = [
  { value: "photo", label: "Foto", hint: "Suba uma ou mais fotos com legenda." },
  { value: "text", label: "Texto", hint: "Cole o texto pronto da notícia." },
  { value: "link", label: "Link", hint: "Cole a URL — extraímos o conteúdo." },
];

export function CaptureForm() {
  const router = useRouter();
  const [tab, setTab] = useState<SourceType>("photo");
  const [region, setRegion] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function uploadFiles(): Promise<{ storageUrl: string; orderIndex: number }[]> {
    const out: { storageUrl: string; orderIndex: number }[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`Enviando foto ${i + 1}/${files.length}…`);
      const fd = new FormData();
      fd.append("file", files[i]);
      const { url } = await apiPost<{ url: string }>("/api/upload", fd);
      out.push({ storageUrl: url, orderIndex: i });
    }
    return out;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const photos = files.length > 0 ? await uploadFiles() : [];
      setBusy("Gerando texto com IA…");
      const { post } = await apiPost<{ post: { id: string } }>("/api/posts", {
        sourceType: tab,
        region: region || undefined,
        sourceText: tab !== "link" ? text || undefined : undefined,
        sourceUrl: tab === "link" ? url : undefined,
        photos,
      });
      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === t.value
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {TABS.find((t) => t.value === tab)?.hint}
      </p>

      <div>
        <label className="label">Região / editoria (opcional)</label>
        <input
          className="input"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Ex.: Cidades, Política, Esportes"
        />
      </div>

      {tab === "link" ? (
        <div>
          <label className="label">URL da notícia</label>
          <input
            className="input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            required
          />
        </div>
      ) : (
        <div>
          <label className="label">
            {tab === "photo" ? "Legenda / descrição da foto" : "Texto da notícia"}
          </label>
          <textarea
            className="input min-h-32"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              tab === "photo"
                ? "Descreva o que a foto mostra (base factual para a IA)."
                : "Cole aqui o texto pronto."
            }
            required={tab === "text"}
          />
        </div>
      )}

      {tab !== "link" && (
        <div>
          <label className="label">
            Fotos {tab === "photo" ? "(obrigatório)" : "(opcional)"}
          </label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700"
          />
          {files.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              {files.length} arquivo(s) selecionado(s)
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={!!busy}>
        {busy ?? "Gerar e ir para a arte"}
      </button>
    </form>
  );
}
