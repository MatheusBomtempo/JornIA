"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch } from "@/lib/api-client";
import { ArtEditor, type EditorTemplate, type EditorPhoto } from "./ArtEditor";
import { InstagramPreview } from "./InstagramPreview";
import { StatusBadge } from "./StatusBadge";
import { POST_STATUS, type UserRole } from "@/lib/domain";

// Shapes serializáveis (subconjunto do detalhe do post).
interface Version {
  id: string;
  versionNumber: number;
  origin: string;
  title: string | null;
  shortNews: string | null;
  instagramCaption: string | null;
  artText: string | null;
  renderedArtUrl: string | null;
  selectedPhotoId: string | null;
  artTemplateId: string | null;
  photoTransform: { offsetX: number; offsetY: number; scale: number } | null;
  createdAt: string;
  decisions: {
    id: string;
    decision: string;
    reason: string | null;
    reviewer: { name: string };
    createdAt: string;
  }[];
}

interface PostDetail {
  id: string;
  status: string;
  sourceType: string;
  region: string | null;
  createdBy: string;
  author: { name: string };
  photos: EditorPhoto[];
  versions: Version[];
}

interface Props {
  user: { id: string; name: string; role: UserRole };
  post: PostDetail;
  templates: EditorTemplate[];
}

export function PostWorkspace({ user, post, templates }: Props) {
  const router = useRouter();
  const current = post.versions[0];

  const canReview = user.role === "manager" || user.role === "admin";
  const canEdit =
    canReview || post.createdBy === user.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: current?.title ?? "",
    shortNews: current?.shortNews ?? "",
    instagramCaption: current?.instagramCaption ?? "",
    artText: current?.artText ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showEditor =
    canEdit &&
    (post.status === POST_STATUS.EDITING_ART ||
      post.status === POST_STATUS.PROCESSING_AI);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    run("Publicando no Instagram…", () =>
      apiPost(`/api/posts/${post.id}/versions/${current.id}/approve`),
    );

  const reject = () => {
    const reason = window.prompt("Motivo da recusa:");
    if (!reason) return;
    return run("Recusando…", () =>
      apiPost(`/api/posts/${post.id}/versions/${current.id}/reject`, { reason }),
    );
  };

  const regenerate = () => {
    const guidance =
      window.prompt("Ajuste para a IA (opcional):", "") ?? undefined;
    return run("Refazendo com IA…", () =>
      apiPost(`/api/posts/${post.id}/regenerate`, { guidance }),
    );
  };

  const saveEdit = () =>
    run("Salvando edição…", async () => {
      await apiPatch(`/api/posts/${post.id}/versions/${current.id}`, draft);
      setEditing(false);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={post.status} />
          <span className="text-sm text-gray-500">
            fonte: {post.sourceType}
            {post.region ? ` · ${post.region}` : ""} · por {post.author.name} ·
            versão {current?.versionNumber}
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna esquerda: editor de arte OU preview do Instagram */}
        <div className="card p-4">
          {showEditor ? (
            <>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                Editor de arte
              </h2>
              {post.photos.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Este post não tem fotos. Adicione uma foto na captura para
                  montar a arte.
                </p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum template cadastrado. Um admin/manager precisa criar um
                  template em Admin.
                </p>
              ) : (
                <ArtEditor
                  postId={post.id}
                  photos={post.photos}
                  templates={templates}
                  initial={{
                    selectedPhotoId: current?.selectedPhotoId,
                    artTemplateId: current?.artTemplateId,
                    photoTransform: current?.photoTransform,
                    artText: current?.artText,
                  }}
                  onSaved={() => router.refresh()}
                />
              )}
            </>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                Prévia no feed
              </h2>
              <InstagramPreview
                artUrl={current?.renderedArtUrl}
                caption={current?.instagramCaption}
              />
            </>
          )}
        </div>

        {/* Coluna direita: texto + ações */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Texto</h2>
              {canEdit && !editing && (
                <button
                  className="btn-ghost text-xs"
                  onClick={() => setEditing(true)}
                >
                  Editar
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <Field
                  label="Título"
                  value={draft.title}
                  onChange={(v) => setDraft({ ...draft, title: v })}
                />
                <Field
                  label="Notícia curta"
                  textarea
                  value={draft.shortNews}
                  onChange={(v) => setDraft({ ...draft, shortNews: v })}
                />
                <Field
                  label="Legenda do Instagram"
                  textarea
                  value={draft.instagramCaption}
                  onChange={(v) =>
                    setDraft({ ...draft, instagramCaption: v })
                  }
                />
                <Field
                  label="Texto da arte"
                  value={draft.artText}
                  onChange={(v) => setDraft({ ...draft, artText: v })}
                />
                <div className="flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={saveEdit}
                    disabled={!!busy}
                  >
                    {busy ?? "Salvar edição"}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => setEditing(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <ReadField label="Título" value={current?.title} />
                <ReadField label="Notícia curta" value={current?.shortNews} />
                <ReadField
                  label="Legenda do Instagram"
                  value={current?.instagramCaption}
                />
                <ReadField label="Texto da arte" value={current?.artText} />
              </dl>
            )}
          </div>

          {/* Ações de revisão */}
          <div className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-gray-700">Revisão</h2>
            {post.status === POST_STATUS.IN_REVIEW && canReview ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-success"
                  onClick={approve}
                  disabled={!!busy || !current?.renderedArtUrl}
                >
                  Aprovar e publicar
                </button>
                <button className="btn-danger" onClick={reject} disabled={!!busy}>
                  Recusar
                </button>
                <button className="btn-ghost" onClick={regenerate} disabled={!!busy}>
                  Refazer com IA
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {post.status === POST_STATUS.IN_REVIEW
                  ? "Aguardando um editor/gerente revisar."
                  : post.status === POST_STATUS.PUBLISHED
                    ? "Publicado. 🎉"
                    : post.status === POST_STATUS.REJECTED
                      ? "Post recusado."
                      : "Finalize a arte para enviar à revisão."}
              </p>
            )}
            {canEdit && post.status !== POST_STATUS.PUBLISHED && (
              <button
                className="btn-ghost text-xs"
                onClick={regenerate}
                disabled={!!busy}
              >
                Gerar nova versão com IA
              </button>
            )}
          </div>

          {/* Histórico de versões */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              Histórico ({post.versions.length})
            </h2>
            <ol className="space-y-2 text-sm">
              {post.versions.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">v{v.versionNumber}</span>{" "}
                    <span className="text-gray-500">· {originLabel(v.origin)}</span>
                    {v.decisions.map((d) => (
                      <div key={d.id} className="text-xs text-gray-500">
                        {decisionLabel(d.decision)} por {d.reviewer.name}
                        {d.reason ? ` — "${d.reason}"` : ""}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(v.createdAt).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea
          className="input"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-gray-800">
        {value || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}

function originLabel(origin: string): string {
  return (
    {
      ai_generated: "gerado por IA",
      ai_regenerated: "refeito por IA",
      manual_edit: "edição manual",
    }[origin] ?? origin
  );
}

function decisionLabel(decision: string): string {
  return (
    {
      approved: "aprovado",
      rejected: "recusado",
      regenerate: "pedido de refação",
      manual_edit: "editado",
    }[decision] ?? decision
  );
}
