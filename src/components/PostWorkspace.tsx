"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch } from "@/lib/api-client";
import { ArtEditor, type EditorTemplate, type EditorPhoto } from "./ArtEditor";
import { InstagramPreview } from "./InstagramPreview";
import { StatusBadge } from "./StatusBadge";
import { BusyLabel, useElapsedSeconds } from "./Spinner";
import { POST_STATUS, type UserRole } from "@/lib/domain";

interface Version {
  id: string;
  versionNumber: number;
  origin: string;
  title: string | null;
  subtitle: string | null;
  instagramCaption: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  renderedArtUrl: string | null;
  selectedPhotoId: string | null;
  artTemplateId: string | null;
  photoTransform: { offsetX: number; offsetY: number; scale: number } | null;
  titleOffset: { offsetX: number; offsetY: number } | null;
  subtitleOffset: { offsetX: number; offsetY: number } | null;
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

type Step = "art" | "review";
type Panel = null | "rewrite" | "reject" | "text";

export function PostWorkspace({ user, post, templates }: Props) {
  const router = useRouter();
  const current = post.versions[0];

  const canReview = user.role === "manager" || user.role === "admin";
  const canEdit = canReview || post.createdBy === user.id;

  // Proporção real do template desta versão, pra prévia não cortar o 4:5.
  const currentTemplate = templates.find((t) => t.id === current?.artTemplateId);
  const previewRatio = currentTemplate
    ? currentTemplate.canvasWidth / currentTemplate.canvasHeight
    : undefined;
  const isFinished =
    post.status === POST_STATUS.PUBLISHED || post.status === POST_STATUS.REJECTED;

  const naturalStep: Step =
    post.status === POST_STATUS.EDITING_ART ||
    post.status === POST_STATUS.PROCESSING_AI
      ? "art"
      : "review";
  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const step: Step = stepOverride ?? naturalStep;

  const [panel, setPanel] = useState<Panel>(null);
  const [guidance, setGuidance] = useState("");
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState({
    title: current?.title ?? "",
    subtitle: current?.subtitle ?? "",
    instagramCaption: current?.instagramCaption ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsedSeconds(!!busy);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      setPanel(null);
      setStepOverride(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    run("Publicando…", () =>
      apiPost(`/api/posts/${post.id}/versions/${current.id}/approve`),
    );

  const reject = () =>
    run("Recusando…", () =>
      apiPost(`/api/posts/${post.id}/versions/${current.id}/reject`, { reason }),
    );

  const rewrite = () =>
    run("Reescrevendo com IA…", () =>
      apiPost(`/api/posts/${post.id}/regenerate`, {
        guidance: guidance.trim() || undefined,
      }),
    );

  const saveText = () =>
    run("Salvando texto…", () =>
      apiPatch(`/api/posts/${post.id}/versions/${current.id}`, draft),
    );

  const hasPhotos = post.photos.length > 0;
  const hasTemplates = templates.length > 0;

  return (
    <div className="space-y-5">
      {/* Cabeçalho + passos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={post.status} />
        <span className="text-xs text-muted">
          por {post.author.name} · versão {current?.versionNumber}
        </span>
      </div>

      {!isFinished && (
        <ol className="flex items-center gap-2 text-xs font-medium">
          <StepChip n={1} label="Arte" active={step === "art"} done={step === "review"} />
          <span className="h-px w-6 bg-line" />
          <StepChip n={2} label="Revisão" active={step === "review"} />
        </ol>
      )}

      {error && <p className="alert-error">{error}</p>}

      {/* ───────────── PASSO 1: ARTE ───────────── */}
      {step === "art" && (
        <section className="card p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-semibold">Ajuste a arte</h2>
          <p className="hint mb-4 mt-0">
            Enquadre a foto e revise a frase que vai sobre a imagem.
          </p>

          {!hasPhotos ? (
            <EmptyNote>
              Este post não tem foto. Sem foto não dá para montar a arte — crie uma
              nova pauta enviando a imagem junto.
            </EmptyNote>
          ) : !hasTemplates ? (
            <EmptyNote>
              Nenhum template cadastrado ainda. Um administrador precisa criar o
              template da marca em <strong className="text-ink">Admin → Templates</strong>.
            </EmptyNote>
          ) : (
            <ArtEditor
              postId={post.id}
              photos={post.photos}
              templates={templates}
              initial={{
                selectedPhotoId: current?.selectedPhotoId,
                artTemplateId: current?.artTemplateId,
                photoTransform: current?.photoTransform,
                title: current?.title,
                subtitle: current?.subtitle,
                titleOffset: current?.titleOffset,
                subtitleOffset: current?.subtitleOffset,
              }}
              onSaved={() => {
                setStepOverride(null);
                router.refresh();
              }}
            />
          )}

          {naturalStep === "review" && (
            <button
              className="btn-subtle mt-4 w-full"
              onClick={() => setStepOverride("review")}
            >
              ← Voltar para a revisão
            </button>
          )}
        </section>
      )}

      {/* ───────────── PASSO 2: REVISÃO ───────────── */}
      {step === "review" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* Prévia */}
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Como vai ficar no feed</h2>
            <InstagramPreview
              artUrl={current?.renderedArtUrl}
              caption={current?.instagramCaption}
              aspectRatio={previewRatio}
            />
          </section>

          <div className="space-y-5">
            {/* Texto */}
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Texto do post</h2>
                  {current?.aiProvider && (
                    <span
                      className="badge bg-brand-500/10 text-brand-300"
                      title={current.aiModel ? `Modelo: ${current.aiModel}` : undefined}
                    >
                      ✨ {aiSourceLabel(current.aiProvider)}
                    </span>
                  )}
                </div>
                {canEdit && !isFinished && panel !== "text" && (
                  <button className="btn-ghost btn-sm" onClick={() => setPanel("text")}>
                    Editar
                  </button>
                )}
              </div>

              {panel === "text" ? (
                <div className="space-y-3">
                  <Field label="Título na imagem" value={draft.title} max={69}
                    onChange={(v) => setDraft({ ...draft, title: v })} />
                  <Field label="Subtítulo na imagem" textarea max={149} value={draft.subtitle}
                    onChange={(v) => setDraft({ ...draft, subtitle: v })} />
                  <Field label="Legenda do Instagram" textarea rows={10}
                    value={draft.instagramCaption}
                    onChange={(v) => setDraft({ ...draft, instagramCaption: v })} />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" onClick={saveText} disabled={!!busy}>
                      {busy ? <BusyLabel label={busy} seconds={elapsed} /> : "Salvar texto"}
                    </button>
                    <button className="btn-subtle" onClick={() => setPanel(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="space-y-3">
                  <Read label="Título na imagem" value={current?.title} art />
                  <Read label="Subtítulo na imagem" value={current?.subtitle} art />
                  <Read label="Legenda do Instagram" value={current?.instagramCaption} />
                </dl>
              )}
            </section>

            {/* Decisões */}
            {!isFinished && (
              <section className="card p-4">
                <h2 className="text-sm font-semibold">E agora?</h2>
                <p className="hint mb-3 mt-0.5">
                  Escolha o que fazer com esta versão do post.
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {canReview && (
                    <Decision
                      icon="✅" title="Aprovar e publicar"
                      desc="Envia para o Instagram agora"
                      tone="success"
                      disabled={!!busy || !current?.renderedArtUrl}
                      onClick={approve}
                    />
                  )}
                  <Decision
                    icon="🔄" title="A IA reescreve"
                    desc="Gera uma nova versão do texto"
                    disabled={!!busy || !canEdit}
                    onClick={() => setPanel(panel === "rewrite" ? null : "rewrite")}
                  />
                  <Decision
                    icon="🖼️" title="Editar a foto"
                    desc="Volta para o enquadramento"
                    disabled={!!busy || !canEdit || !hasPhotos}
                    onClick={() => setStepOverride("art")}
                  />
                  <Decision
                    icon="✏️" title="Editar o texto"
                    desc="Ajuste manual, sem IA"
                    disabled={!!busy || !canEdit}
                    onClick={() => setPanel("text")}
                  />
                  {canReview && (
                    <Decision
                      icon="🚫" title="Recusar"
                      desc="Arquiva com um motivo"
                      tone="danger"
                      disabled={!!busy}
                      onClick={() => setPanel(panel === "reject" ? null : "reject")}
                    />
                  )}
                </div>

                {!current?.renderedArtUrl && canReview && (
                  <p className="hint">
                    A arte ainda não foi gerada — finalize o passo 1 para poder publicar.
                  </p>
                )}
                {!canReview && (
                  <p className="hint">
                    Você envia e edita; a aprovação final é de um editor/gerente.
                  </p>
                )}

                {panel === "rewrite" && (
                  <div className="mt-3 space-y-2 rounded-xl border border-line bg-elevated p-3 animate-fade-in">
                    <label className="label" htmlFor="guidance">
                      Quer orientar a IA? (opcional)
                    </label>
                    <input
                      id="guidance" className="input" value={guidance}
                      onChange={(e) => setGuidance(e.target.value)}
                      placeholder="Ex.: mais curto, tom mais sóbrio, foco no impacto"
                    />
                    <button className="btn-primary w-full" onClick={rewrite} disabled={!!busy}>
                      {busy ? <BusyLabel label={busy} seconds={elapsed} /> : "Reescrever com IA"}
                    </button>
                    {busy && elapsed >= 8 && (
                      <p className="text-center text-xs text-muted">
                        A IA gratuita às vezes demora — ainda estamos tentando.
                      </p>
                    )}
                  </div>
                )}

                {panel === "reject" && (
                  <div className="mt-3 space-y-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 animate-fade-in">
                    <label className="label" htmlFor="reason">Motivo da recusa</label>
                    <input
                      id="reason" className="input" value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Obrigatório — fica no histórico"
                    />
                    <button
                      className="btn-danger w-full" onClick={reject}
                      disabled={!!busy || reason.trim().length < 3}
                    >
                      {busy ? <BusyLabel label={busy} seconds={elapsed} /> : "Confirmar recusa"}
                    </button>
                  </div>
                )}
              </section>
            )}

            {isFinished && (
              <section className="card p-4">
                <p className="text-sm">
                  {post.status === POST_STATUS.PUBLISHED
                    ? "🎉 Post publicado no Instagram."
                    : "Post recusado e arquivado."}
                </p>
              </section>
            )}

            {/* Histórico */}
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">
                Histórico ({post.versions.length})
              </h2>
              <ol className="space-y-2.5">
                {post.versions.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">v{v.versionNumber}</span>{" "}
                      <span className="text-muted">· {originLabel(v.origin)}</span>
                      {v.aiProvider && (
                        <span className="text-muted"> · {aiSourceLabel(v.aiProvider)}</span>
                      )}
                      {v.decisions.map((d) => (
                        <div key={d.id} className="text-xs text-muted">
                          {decisionLabel(d.decision)} por {d.reviewer.name}
                          {d.reason ? ` — “${d.reason}”` : ""}
                        </div>
                      ))}
                    </div>
                    <span className="shrink-0 text-xs text-faint">
                      {new Date(v.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Peças de UI ──────────────────────────────────────────────

function StepChip({
  n, label, active, done,
}: { n: number; label: string; active?: boolean; done?: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
        active
          ? "bg-brand-500/15 text-brand-300"
          : done
            ? "text-emerald-400"
            : "text-faint"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
          active ? "bg-brand-500 text-white" : done ? "bg-emerald-500/20" : "bg-line"
        }`}
      >
        {done ? "✓" : n}
      </span>
      {label}
    </li>
  );
}

function Decision({
  icon, title, desc, onClick, disabled, tone,
}: {
  icon: string; title: string; desc: string;
  onClick: () => void; disabled?: boolean;
  tone?: "success" | "danger";
}) {
  const ring =
    tone === "success"
      ? "hover:border-emerald-500/60 hover:bg-emerald-500/10"
      : tone === "danger"
        ? "hover:border-red-500/60 hover:bg-red-500/10"
        : "hover:border-brand-500/60 hover:bg-brand-500/10";
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`flex items-start gap-3 rounded-xl border border-line bg-elevated p-3
                  text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ring}`}
    >
      <span aria-hidden className="text-lg leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="alert-info">{children}</p>;
}

function Field({
  label, value, onChange, textarea, max, rows = 3,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  textarea?: boolean; max?: number; rows?: number;
}) {
  const over = max !== undefined && value.length > max;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label">{label}</label>
        {max !== undefined && (
          <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-faint"}`}>
            {value.length}/{max}
          </span>
        )}
      </div>
      {textarea ? (
        <textarea
          className="input resize-y" rows={rows} value={value} maxLength={max}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input" value={value} maxLength={max}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function Read({
  label, value, art,
}: { label: string; value?: string | null; art?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </dt>
      <dd
        className={`mt-0.5 whitespace-pre-wrap break-words text-sm text-ink ${
          art ? "font-art" : ""
        }`}
      >
        {value || <span className="text-faint">—</span>}
      </dd>
    </div>
  );
}

/**
 * Nome amigável do provedor que gerou o texto. Provedores dentro da corrente
 * de fallback (chain) chegam como "openrouter:modelo" — extrai só o nome.
 */
function aiSourceLabel(provider: string): string {
  const base = provider.split(":")[0];
  const names: Record<string, string> = {
    groq: "Groq",
    openrouter: "OpenRouter",
    nvidia: "NVIDIA",
    gemini: "Gemini",
    anthropic: "Claude",
    openai: "OpenAI",
    mock: "modo dev (sem IA)",
  };
  return names[base] ?? base;
}

function originLabel(origin: string): string {
  return (
    { ai_generated: "gerado por IA", ai_regenerated: "reescrito por IA", manual_edit: "edição manual" }[
      origin
    ] ?? origin
  );
}

function decisionLabel(decision: string): string {
  return (
    { approved: "aprovado", rejected: "recusado", regenerate: "pedido de reescrita", manual_edit: "editado" }[
      decision
    ] ?? decision
  );
}
