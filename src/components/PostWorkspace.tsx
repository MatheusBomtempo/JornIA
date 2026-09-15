"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch } from "@/lib/api-client";
import { ArtEditor, type EditorTemplate, type EditorPhoto } from "./ArtEditor";
import { InstagramPreview } from "./InstagramPreview";
import { StatusBadge } from "./StatusBadge";
import { Stepper } from "./Stepper";
import { BusyLabel, useElapsedSeconds } from "./Spinner";
import {
  POST_STATUS,
  PEER_APPROVALS_NEEDED,
  formatCredit,
  type Credit,
  type UserRole,
} from "@/lib/domain";

const MAX_PHOTO_MB = 15;

function googleImagesUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function freePhotosUrl(query: string): string {
  return `https://www.pexels.com/search/${encodeURIComponent(query)}/`;
}

interface Version {
  id: string;
  versionNumber: number;
  origin: string;
  title: string | null;
  subtitle: string | null;
  instagramCaption: string | null;
  imageSuggestions: string[];
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
    reviewer: { id: string; name: string };
    createdAt: string;
  }[];
}

interface PostDetail {
  id: string;
  status: string;
  sourceType: string;
  createdBy: string;
  author: { name: string };
  credits: Credit[];
  photos: EditorPhoto[];
  versions: Version[];
}

interface Props {
  user: { id: string; name: string; role: UserRole };
  post: PostDetail;
  templates: EditorTemplate[];
}

const STEP_ORDER = ["text", "image", "review"] as const;
type Step = (typeof STEP_ORDER)[number];
const STEP_LABELS = ["Texto", "Imagem", "Revisão"];

type Panel = null | "rewrite" | "reject" | "text";

export function PostWorkspace({ user, post, templates }: Props) {
  const router = useRouter();
  const current = post.versions[0];

  // Quem pode editar texto/foto (o autor, ou manager/admin) vs. quem pode
  // revisar a pauta de OUTRA pessoa (colega jornalista, ou manager/admin).
  // São poderes diferentes: revisar não dá direito de reescrever o post de
  // outro à mão, só de aprovar/recusar/pedir que a IA refaça.
  const isAuthor = post.createdBy === user.id;
  const isManagerOrAdmin = user.role === "manager" || user.role === "admin";
  const isPeerReviewer = user.role === "staff" && !isAuthor;
  const canEdit = isManagerOrAdmin || isAuthor;
  const canDecide = isManagerOrAdmin || isPeerReviewer;

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
      ? "image"
      : "review";
  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  const step: Step = stepOverride ?? naturalStep;
  const stepIndex = STEP_ORDER.indexOf(step);
  const goToStep = (i: number) => setStepOverride(STEP_ORDER[i]);

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

  // Foto decidida DEPOIS de gerar o texto (achou uma melhor, baixou do
  // Google ou de um banco gratuito a partir de uma sugestão da IA). Nunca
  // troca a foto já enviada sozinha — só some à lista pro jornalista escolher.
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoDragging, setPhotoDragging] = useState(false);
  const [lastAddedPhotoId, setLastAddedPhotoId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const addPhoto = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setPhotoError("Aqui só entra imagem (JPEG, PNG ou WebP).");
        return;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setPhotoError(`A imagem passa de ${MAX_PHOTO_MB} MB.`);
        return;
      }
      setPhotoError(null);
      setPhotoBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const up = await apiPost<{ url: string }>("/api/upload", fd);
        const { photo } = await apiPost<{ photo: { id: string } }>(
          `/api/posts/${post.id}/photos`,
          { storageUrl: up.url },
        );
        setLastAddedPhotoId(photo.id);
        router.refresh();
      } catch (err) {
        setPhotoError((err as Error).message);
      } finally {
        setPhotoBusy(false);
      }
    },
    [post.id, router],
  );

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
    run(isPeerReviewer ? "Registrando aprovação…" : "Publicando…", () =>
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

  const approvals = current?.decisions.filter((d) => d.decision === "approved") ?? [];
  const myApproval = approvals.find((d) => d.reviewer.id === user.id);

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={post.status} />
        <span className="text-xs text-muted">
          por {post.author.name} · versão {current?.versionNumber}
        </span>
      </div>

      {!isFinished && (
        <div className="space-y-2">
          <Stepper steps={STEP_LABELS} current={stepIndex} reachable={2} onStepClick={goToStep} />
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn-subtle btn-sm"
              disabled={stepIndex === 0}
              onClick={() => goToStep(stepIndex - 1)}
            >
              ← Voltar
            </button>
            <button
              type="button"
              className="btn-subtle btn-sm"
              disabled={stepIndex === STEP_ORDER.length - 1}
              onClick={() => goToStep(stepIndex + 1)}
            >
              Avançar →
            </button>
          </div>
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}

      {/* ───────────── PASSO 1: TEXTO ───────────── */}
      {step === "text" && (
        <section className="card space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
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

          {post.credits.length > 0 && (
            <div className="border-t border-lineSoft pt-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Créditos e marcações
              </dt>
              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                {post.credits.map((c, i) => (
                  <li key={i}>{formatCredit(c)}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ───────────── PASSO 2: IMAGEM ───────────── */}
      {step === "image" && (
        <section className="card p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-semibold">Imagem do post</h2>
          <p className="hint mb-4 mt-0">
            Enquadre a foto e revise a frase que vai sobre a imagem.
          </p>

          {!canEdit ? (
            // Colega revisando: só visualiza, não mexe na foto de outra pessoa.
            <div className="space-y-4">
              {current?.renderedArtUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.renderedArtUrl}
                  alt="Arte atual"
                  className="mx-auto max-w-[420px] rounded-xl border border-line"
                />
              ) : (
                <EmptyNote>
                  {hasPhotos
                    ? "A foto já foi enviada, mas a arte ainda não foi finalizada pelo autor."
                    : "Este post ainda não tem foto."}
                </EmptyNote>
              )}
              <ImageSuggestions suggestions={current?.imageSuggestions ?? []} />
            </div>
          ) : !hasPhotos ? (
            <div className="space-y-4">
              <EmptyNote>
                Este post ainda não tem foto — envie a sua, ou use as sugestões
                de busca abaixo pra achar uma e depois enviá-la aqui.
              </EmptyNote>
              <PhotoUploader
                dragging={photoDragging}
                busy={photoBusy}
                onDragOver={() => setPhotoDragging(true)}
                onDragLeave={() => setPhotoDragging(false)}
                onDrop={(f) => { setPhotoDragging(false); addPhoto(f); }}
                onPick={() => photoInputRef.current?.click()}
              />
              {photoError && <p className="alert-error">{photoError}</p>}
              <ImageSuggestions suggestions={current?.imageSuggestions ?? []} />
            </div>
          ) : !hasTemplates ? (
            <EmptyNote>
              Nenhum template cadastrado ainda. Um administrador precisa criar o
              template da marca em <strong className="text-ink">Admin → Templates</strong>.
            </EmptyNote>
          ) : (
            <div className="space-y-4">
              <details className="group card-soft p-3">
                <summary className="btn-ghost w-full cursor-pointer list-none">
                  📷 Adicionar ou trocar a foto
                </summary>
                <div className="mt-3 space-y-3">
                  <PhotoUploader
                    dragging={photoDragging}
                    busy={photoBusy}
                    compact
                    onDragOver={() => setPhotoDragging(true)}
                    onDragLeave={() => setPhotoDragging(false)}
                    onDrop={(f) => { setPhotoDragging(false); addPhoto(f); }}
                    onPick={() => photoInputRef.current?.click()}
                  />
                  {photoError && <p className="alert-error">{photoError}</p>}
                  <ImageSuggestions suggestions={current?.imageSuggestions ?? []} />
                </div>
              </details>

              <ArtEditor
                key={post.photos.map((p) => p.id).join(",")}
                postId={post.id}
                photos={post.photos}
                templates={templates}
                initial={{
                  selectedPhotoId: lastAddedPhotoId ?? current?.selectedPhotoId,
                  artTemplateId: current?.artTemplateId,
                  photoTransform:
                    lastAddedPhotoId ? null : current?.photoTransform,
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
            </div>
          )}
          {canEdit && (
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => addPhoto(e.target.files?.[0])}
            />
          )}
        </section>
      )}

      {/* ───────────── PASSO 3: REVISÃO ───────────── */}
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
            {/* Decisão — uma ação primária clara por papel, o resto fica discreto. */}
            {!isFinished && (
              <section className="card p-4">
                <h2 className="mb-3 text-sm font-semibold">Decisão</h2>

                {isManagerOrAdmin && (
                  <button
                    className="btn-success w-full"
                    onClick={approve}
                    disabled={!!busy || !current?.renderedArtUrl}
                  >
                    {busy ? <BusyLabel label={busy} seconds={elapsed} /> : "✅ Aprovar e publicar"}
                  </button>
                )}

                {isPeerReviewer && (
                  <>
                    <p className="hint mb-2 mt-0">
                      {approvals.length}/{PEER_APPROVALS_NEEDED} jornalistas já aprovaram
                      esta versão — publica sozinho com {PEER_APPROVALS_NEEDED}, ou na hora
                      com 1 aprovação de editor/gerente.
                    </p>
                    <button
                      className="btn-success w-full"
                      onClick={approve}
                      disabled={!!busy || !current?.renderedArtUrl || !!myApproval}
                    >
                      {busy ? (
                        <BusyLabel label={busy} seconds={elapsed} />
                      ) : myApproval ? (
                        "✓ Você já aprovou"
                      ) : (
                        "🙋 Aprovar esta pauta"
                      )}
                    </button>
                  </>
                )}

                {isAuthor && !isManagerOrAdmin && (
                  <p className="alert-info">
                    {approvals.length > 0
                      ? `Aguardando aprovação — ${approvals.length}/${PEER_APPROVALS_NEEDED} jornalistas já aprovaram.`
                      : `Aguardando aprovação de ${PEER_APPROVALS_NEEDED} outros jornalistas, ou de um editor/gerente.`}
                  </p>
                )}

                {!current?.renderedArtUrl && (
                  <p className="hint">
                    A arte ainda não foi gerada — finalize o passo 2 (Imagem) antes.
                  </p>
                )}

                {(canEdit || isPeerReviewer || canDecide) && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(canEdit || isPeerReviewer) && (
                      <Decision
                        icon="🔄" title="Pedir reescrita"
                        desc="A IA gera uma nova versão do texto"
                        disabled={!!busy}
                        onClick={() => setPanel(panel === "rewrite" ? null : "rewrite")}
                      />
                    )}
                    {canDecide && (
                      <Decision
                        icon="🚫" title="Recusar"
                        desc="Arquiva com um motivo"
                        tone="danger"
                        disabled={!!busy}
                        onClick={() => setPanel(panel === "reject" ? null : "reject")}
                      />
                    )}
                  </div>
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

/**
 * Envio de foto direto na tela de revisão — pro caso em que o jornalista só
 * decide a imagem depois de ver o texto pronto (achou uma melhor, baixou do
 * Google ou de um banco gratuito). Aceita arrastar-e-soltar ou o botão
 * tradicional; nunca é a única forma de adicionar foto, só mais uma.
 */
function PhotoUploader({
  dragging, busy, compact, onDragOver, onDragLeave, onDrop, onPick,
}: {
  dragging: boolean;
  busy: boolean;
  compact?: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (file: File | undefined) => void;
  onPick: () => void;
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(e.dataTransfer.files?.[0]); }}
      onClick={onPick}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl
                  border-2 border-dashed text-center transition-colors ${
                    compact ? "px-3 py-4" : "px-4 py-8"
                  } ${
                    dragging
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-line bg-elevated/60 hover:border-brand-500/60"
                  }`}
    >
      <p className="text-sm font-medium">
        {busy ? "Enviando…" : "Arraste a foto ou toque para escolher"}
      </p>
      <p className="text-xs text-muted">JPEG, PNG ou WebP · até {MAX_PHOTO_MB} MB</p>
    </div>
  );
}

/**
 * Exatamente 2 sugestões de busca geradas pela IA — só ajudam a achar uma
 * imagem; nunca escolhem, baixam ou publicam nada sozinhas. Cada sugestão
 * abre a busca correspondente numa aba nova; a foto encontrada precisa ser
 * baixada e enviada de volta pelo uploader acima.
 */
function ImageSuggestions({ suggestions }: { suggestions: string[] }) {
  if (!suggestions.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">
        💡 Sugestões de busca de imagem (a IA só sugere — quem escolhe é você)
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.slice(0, 2).map((q) => (
          <div key={q} className="card-soft space-y-2 p-3">
            <p className="truncate text-sm font-medium text-ink" title={q}>
              “{q}”
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={googleImagesUrl(q)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost btn-sm"
              >
                🔎 Google Imagens
              </a>
              <a
                href={freePhotosUrl(q)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost btn-sm"
              >
                🖼️ Fotos gratuitas
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
