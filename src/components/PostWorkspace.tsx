"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";
import { ArtEditor, type EditorTemplate, type EditorPhoto } from "./ArtEditor";
import { VideoEditor, type EditorVideo } from "./VideoEditor";
import { InstagramPreview } from "./InstagramPreview";
import { StatusBadge } from "./StatusBadge";
import { Stepper } from "./Stepper";
import { BusyLabel, useElapsedSeconds } from "./Spinner";
import { useLocale } from "./LocaleProvider";
import {
  POST_STATUS,
  PEER_APPROVALS_NEEDED,
  formatCredit,
  type Credit,
  type UserRole,
} from "@/lib/domain";

const MAX_PHOTO_MB = 15;
const MAX_VIDEO_MB = 100;

function googleImagesUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function freePhotosUrl(query: string): string {
  return `https://www.pexels.com/search/${encodeURIComponent(query)}/`;
}

/**
 * Sobe o vídeo pro storage. Tenta primeiro PUT direto no bucket (URL
 * assinada) — o corpo nunca passa pela function, então o teto de payload
 * da Vercel (bem menor que os 100 MB que o app aceita) não entra em jogo.
 * Em storage local (dev) não tem URL assinada: cai de volta pro upload via
 * /api/upload de sempre.
 */
async function uploadVideoFile(file: File): Promise<string> {
  const presign = await apiPost<{ uploadUrl: string | null; publicUrl?: string }>(
    "/api/upload/presign",
    { contentType: file.type },
  );

  if (presign.uploadUrl && presign.publicUrl) {
    const res = await fetch(presign.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!res.ok) throw new Error(`Falha ao enviar o vídeo (${res.status}).`);
    return presign.publicUrl;
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "video");
  const up = await apiPost<{ url: string }>("/api/upload", fd);
  return up.url;
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
  selectedVideoId: string | null;
  videoTemplate: string | null;
  renderedVideoUrl: string | null;
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
  videos: EditorVideo[];
  versions: Version[];
}

interface Props {
  user: { id: string; name: string; role: UserRole };
  post: PostDetail;
  templates: EditorTemplate[];
  company: {
    name: string | null;
    logoUrl: string | null;
    instagramHandle: string | null;
    brandColorDark: string | null;
    brandColorLight: string | null;
  };
}

const STEP_ORDER = ["text", "image", "review"] as const;
type Step = (typeof STEP_ORDER)[number];

type Panel = null | "rewrite" | "reject" | "text";

export function PostWorkspace({ user, post, templates, company }: Props) {
  const router = useRouter();
  const { dict, locale } = useLocale();
  const dateLocale = locale === "pt" ? "pt-BR" : "en-US";
  const STEP_LABELS = [dict.postWorkspace.steps.text, dict.postWorkspace.steps.image, dict.postWorkspace.steps.review];
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

  // Presença de vídeo decide o formato do passo 2 inteiro (VideoEditor em
  // vez de ArtEditor) — post de vídeo não usa template/slots, só o cartão
  // de título com animação, sempre em 9:16 (padrão de Reels).
  const isVideoPost = post.videos.length > 0;
  const mediaReady = !!current?.renderedArtUrl || !!current?.renderedVideoUrl;

  // Proporção real do template desta versão, pra prévia não cortar o 4:5.
  const currentTemplate = templates.find((t) => t.id === current?.artTemplateId);
  const previewRatio = isVideoPost
    ? 1080 / 1920
    : currentTemplate
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
        setPhotoError(dict.postWorkspace.errors.invalidFileType);
        return;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        setPhotoError(
          `${dict.postWorkspace.errors.fileTooLargePrefix} ${MAX_PHOTO_MB} ${dict.postWorkspace.errors.fileTooLargeSuffix}`,
        );
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
    [post.id, router, dict],
  );

  // Busca embutida no Pexels (ver PhotoPickerModal) — string = query aberta
  // no picker, null = fechado. Só um picker por vez, então fica no nível do
  // workspace em vez de duplicado dentro de cada ImageSuggestions.
  const [photoPickerQuery, setPhotoPickerQuery] = useState<string | null>(null);

  // Mesmo final do addPhoto (anexa e recarrega), mas a partir de uma foto já
  // escolhida no picker em vez de um File do input.
  const importPexelsPhoto = useCallback(
    async (downloadUrl: string) => {
      const up = await apiPost<{ url: string }>("/api/photo-search/import", { downloadUrl });
      const { photo } = await apiPost<{ photo: { id: string } }>(
        `/api/posts/${post.id}/photos`,
        { storageUrl: up.url },
      );
      setLastAddedPhotoId(photo.id);
      router.refresh();
    },
    [post.id, router],
  );

  // Mesma ideia do addPhoto, pro vídeo — anexa e recarrega; qual usar
  // continua sendo escolhido manualmente no VideoEditor.
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoDragging, setVideoDragging] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const addVideo = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setVideoError(dict.postWorkspace.errors.invalidVideoType);
        return;
      }
      if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
        setVideoError(
          `${dict.postWorkspace.errors.videoTooLargePrefix} ${MAX_VIDEO_MB} ${dict.postWorkspace.errors.videoTooLargeSuffix}`,
        );
        return;
      }
      setVideoError(null);
      setVideoBusy(true);
      try {
        const storageUrl = await uploadVideoFile(file);
        await apiPost(`/api/posts/${post.id}/videos`, { storageUrl });
        router.refresh();
      } catch (err) {
        setVideoError((err as Error).message);
      } finally {
        setVideoBusy(false);
      }
    },
    [post.id, router, dict],
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
    run(
      isPeerReviewer ? dict.postWorkspace.busy.registeringApproval : dict.postWorkspace.busy.publishing,
      () => apiPost(`/api/posts/${post.id}/versions/${current.id}/approve`),
    );

  const reject = () =>
    run(dict.postWorkspace.busy.rejecting, () =>
      apiPost(`/api/posts/${post.id}/versions/${current.id}/reject`, { reason }),
    );

  const rewrite = () =>
    run(dict.postWorkspace.busy.rewriting, () =>
      apiPost(`/api/posts/${post.id}/regenerate`, {
        guidance: guidance.trim() || undefined,
      }),
    );

  const saveText = () =>
    run(dict.postWorkspace.busy.savingText, () =>
      apiPatch(`/api/posts/${post.id}/versions/${current.id}`, draft),
    );

  const hasPhotos = post.photos.length > 0;
  const hasVideos = post.videos.length > 0;
  const hasTemplates = templates.length > 0;

  const approvals = current?.decisions.filter((d) => d.decision === "approved") ?? [];
  const myApproval = approvals.find((d) => d.reviewer.id === user.id);

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={post.status} />
        <span className="text-xs text-muted">
          {dict.postWorkspace.header.byLabel} {post.author.name} · {dict.postWorkspace.header.versionLabel}{" "}
          {current?.versionNumber}
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
              {dict.postWorkspace.back}
            </button>
            <button
              type="button"
              className="btn-subtle btn-sm"
              disabled={stepIndex === STEP_ORDER.length - 1}
              onClick={() => goToStep(stepIndex + 1)}
            >
              {dict.postWorkspace.forward}
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
              <h2 className="text-sm font-semibold">{dict.postWorkspace.text.heading}</h2>
              {current?.aiProvider && (
                <span
                  className="badge bg-brand-500/10 text-brand-300"
                  title={
                    current.aiModel
                      ? `${dict.postWorkspace.text.modelPrefix} ${current.aiModel}`
                      : undefined
                  }
                >
                  ✨ {aiSourceLabel(current.aiProvider, dict.postWorkspace.aiSource)}
                </span>
              )}
            </div>
            {canEdit && !isFinished && panel !== "text" && (
              <button className="btn-ghost btn-sm" onClick={() => setPanel("text")}>
                {dict.postWorkspace.text.editButton}
              </button>
            )}
          </div>

          {panel === "text" ? (
            <div className="space-y-3">
              <Field label={dict.postWorkspace.text.titleLabel} value={draft.title} max={69}
                onChange={(v) => setDraft({ ...draft, title: v })} />
              <Field label={dict.postWorkspace.text.subtitleLabel} textarea max={149} value={draft.subtitle}
                onChange={(v) => setDraft({ ...draft, subtitle: v })} />
              <Field label={dict.postWorkspace.text.captionLabel} textarea rows={10}
                value={draft.instagramCaption}
                onChange={(v) => setDraft({ ...draft, instagramCaption: v })} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={saveText} disabled={!!busy}>
                  {busy ? <BusyLabel label={busy} seconds={elapsed} /> : dict.postWorkspace.text.saveButton}
                </button>
                <button className="btn-subtle" onClick={() => setPanel(null)}>
                  {dict.common.cancel}
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-3">
              <Read label={dict.postWorkspace.text.titleLabel} value={current?.title} art />
              <Read label={dict.postWorkspace.text.subtitleLabel} value={current?.subtitle} art />
              <Read label={dict.postWorkspace.text.captionLabel} value={current?.instagramCaption} />
            </dl>
          )}

          {post.credits.length > 0 && (
            <div className="border-t border-lineSoft pt-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                {dict.postWorkspace.text.creditsHeading}
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
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden>{isVideoPost ? "▶️" : "📷"}</span>
            {dict.postWorkspace.image.heading}
          </h2>
          <p className="hint mb-4 mt-0">
            {dict.postWorkspace.image.hint}
          </p>

          {!canEdit ? (
            // Colega revisando: só visualiza, não mexe na foto/vídeo de outra pessoa.
            <div className="space-y-4">
              {isVideoPost ? (
                current?.renderedVideoUrl ? (
                  <video
                    src={current.renderedVideoUrl}
                    controls
                    className="mx-auto max-h-[420px] w-full rounded-xl border border-line bg-black"
                  />
                ) : (
                  <EmptyNote>
                    {hasVideos
                      ? dict.postWorkspace.image.videoUploadedNoRender
                      : dict.postWorkspace.image.noVideoReadOnly}
                  </EmptyNote>
                )
              ) : current?.renderedArtUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.renderedArtUrl}
                  alt={dict.postWorkspace.image.artAlt}
                  className="mx-auto max-w-[420px] rounded-xl border border-line"
                />
              ) : (
                <EmptyNote>
                  {hasPhotos
                    ? dict.postWorkspace.image.photoUploadedNoArt
                    : dict.postWorkspace.image.noPhotoReadOnly}
                </EmptyNote>
              )}
              <ImageSuggestions suggestions={current?.imageSuggestions ?? []} />
            </div>
          ) : !hasPhotos && !hasVideos ? (
            <div className="space-y-4">
              <EmptyNote>
                {dict.postWorkspace.image.noPhotoEditable}
              </EmptyNote>
              <div className="grid gap-3 sm:grid-cols-2">
                <PhotoUploader
                  dragging={photoDragging}
                  busy={photoBusy}
                  onDragOver={() => setPhotoDragging(true)}
                  onDragLeave={() => setPhotoDragging(false)}
                  onDrop={(f) => { setPhotoDragging(false); addPhoto(f); }}
                  onPick={() => photoInputRef.current?.click()}
                />
                <VideoUploader
                  dragging={videoDragging}
                  busy={videoBusy}
                  onDragOver={() => setVideoDragging(true)}
                  onDragLeave={() => setVideoDragging(false)}
                  onDrop={(f) => { setVideoDragging(false); addVideo(f); }}
                  onPick={() => videoInputRef.current?.click()}
                />
              </div>
              {photoError && <p className="alert-error">{photoError}</p>}
              {videoError && <p className="alert-error">{videoError}</p>}
              <ImageSuggestions
                suggestions={current?.imageSuggestions ?? []}
                onSearchPhotos={setPhotoPickerQuery}
              />
            </div>
          ) : isVideoPost ? (
            <div className="space-y-4">
              <details className="group card-soft p-3">
                <summary className="btn-ghost w-full cursor-pointer list-none">
                  {dict.postWorkspace.image.addOrChangeVideo}
                </summary>
                <div className="mt-3 space-y-3">
                  <VideoUploader
                    dragging={videoDragging}
                    busy={videoBusy}
                    compact
                    onDragOver={() => setVideoDragging(true)}
                    onDragLeave={() => setVideoDragging(false)}
                    onDrop={(f) => { setVideoDragging(false); addVideo(f); }}
                    onPick={() => videoInputRef.current?.click()}
                  />
                  {videoError && <p className="alert-error">{videoError}</p>}
                </div>
              </details>

              <VideoEditor
                key={post.videos.map((v) => v.id).join(",")}
                postId={post.id}
                videos={post.videos}
                companyLogoUrl={company.logoUrl}
                companyBrandColors={{ dark: company.brandColorDark, light: company.brandColorLight }}
                initial={{
                  selectedVideoId: current?.selectedVideoId,
                  title: current?.title,
                  titleOffsetY: current?.titleOffset?.offsetY,
                  videoTemplate: current?.videoTemplate,
                }}
                onSaved={() => {
                  setStepOverride(null);
                  router.refresh();
                }}
              />
            </div>
          ) : !hasTemplates ? (
            <EmptyNote>
              {dict.postWorkspace.image.noTemplatePrefix}{" "}
              <strong className="text-ink">{dict.postWorkspace.image.noTemplateAdminPath}</strong>.
            </EmptyNote>
          ) : (
            <div className="space-y-4">
              <details className="group card-soft p-3">
                <summary className="btn-ghost w-full cursor-pointer list-none">
                  {dict.postWorkspace.image.addOrChangePhoto}
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
                  <ImageSuggestions
                    suggestions={current?.imageSuggestions ?? []}
                    onSearchPhotos={setPhotoPickerQuery}
                  />
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
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => addPhoto(e.target.files?.[0])}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => addVideo(e.target.files?.[0])}
              />
            </>
          )}
        </section>
      )}

      {/* ───────────── PASSO 3: REVISÃO ───────────── */}
      {step === "review" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* Prévia */}
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">{dict.postWorkspace.review.previewHeading}</h2>
            <InstagramPreview
              artUrl={current?.renderedArtUrl}
              videoUrl={current?.renderedVideoUrl}
              caption={current?.instagramCaption}
              aspectRatio={previewRatio}
              handle={company.instagramHandle ?? company.name ?? undefined}
              logoUrl={company.logoUrl ?? undefined}
            />
          </section>

          <div className="space-y-5">
            {/* Decisão — uma ação primária clara por papel, o resto fica discreto. */}
            {!isFinished && (
              <section className="card p-4">
                <h2 className="mb-3 text-sm font-semibold">{dict.postWorkspace.review.decisionHeading}</h2>

                {isManagerOrAdmin && (
                  <button
                    className="btn-success w-full"
                    onClick={approve}
                    disabled={!!busy || !mediaReady}
                  >
                    {busy ? <BusyLabel label={busy} seconds={elapsed} /> : dict.postWorkspace.review.approveAndPublish}
                  </button>
                )}

                {isPeerReviewer && (
                  <>
                    <p className="hint mb-2 mt-0">
                      {approvals.length}/{PEER_APPROVALS_NEEDED}{" "}
                      {dict.postWorkspace.review.peerApprovedMiddle}{" "}
                      {PEER_APPROVALS_NEEDED}
                      {dict.postWorkspace.review.peerApprovedEnd}
                    </p>
                    <button
                      className="btn-success w-full"
                      onClick={approve}
                      disabled={!!busy || !mediaReady || !!myApproval}
                    >
                      {busy ? (
                        <BusyLabel label={busy} seconds={elapsed} />
                      ) : myApproval ? (
                        dict.postWorkspace.review.alreadyApproved
                      ) : (
                        dict.postWorkspace.review.approveThisStory
                      )}
                    </button>
                  </>
                )}

                {isAuthor && !isManagerOrAdmin && (
                  <p className="alert-info">
                    {approvals.length > 0 ? (
                      <>
                        {dict.postWorkspace.review.waitingWithCountPrefix} {approvals.length}/
                        {PEER_APPROVALS_NEEDED} {dict.postWorkspace.review.waitingWithCountSuffix}
                      </>
                    ) : (
                      <>
                        {dict.postWorkspace.review.waitingNoCountPrefix} {PEER_APPROVALS_NEEDED}{" "}
                        {dict.postWorkspace.review.waitingNoCountSuffix}
                      </>
                    )}
                  </p>
                )}

                {!mediaReady && (
                  <p className="hint">
                    {dict.postWorkspace.review.artNotReady}
                  </p>
                )}

                {(canEdit || isPeerReviewer || canDecide) && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(canEdit || isPeerReviewer) && (
                      <Decision
                        icon="🔄" title={dict.postWorkspace.review.rewriteTitle}
                        desc={dict.postWorkspace.review.rewriteDesc}
                        disabled={!!busy}
                        onClick={() => setPanel(panel === "rewrite" ? null : "rewrite")}
                      />
                    )}
                    {canDecide && (
                      <Decision
                        icon="🚫" title={dict.postWorkspace.review.rejectTitle}
                        desc={dict.postWorkspace.review.rejectDesc}
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
                      {dict.postWorkspace.review.guidanceLabel}
                    </label>
                    <input
                      id="guidance" className="input" value={guidance}
                      onChange={(e) => setGuidance(e.target.value)}
                      placeholder={dict.postWorkspace.review.guidancePlaceholder}
                    />
                    <button className="btn-primary w-full" onClick={rewrite} disabled={!!busy}>
                      {busy ? <BusyLabel label={busy} seconds={elapsed} /> : dict.postWorkspace.review.rewriteButton}
                    </button>
                    {busy && elapsed >= 8 && (
                      <p className="text-center text-xs text-muted">
                        {dict.postWorkspace.review.aiSlowNotice}
                      </p>
                    )}
                  </div>
                )}

                {panel === "reject" && (
                  <div className="mt-3 space-y-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 animate-fade-in">
                    <label className="label" htmlFor="reason">{dict.postWorkspace.review.reasonLabel}</label>
                    <input
                      id="reason" className="input" value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={dict.postWorkspace.review.reasonPlaceholder}
                    />
                    <button
                      className="btn-danger w-full" onClick={reject}
                      disabled={!!busy || reason.trim().length < 3}
                    >
                      {busy ? <BusyLabel label={busy} seconds={elapsed} /> : dict.postWorkspace.review.confirmRejectButton}
                    </button>
                  </div>
                )}
              </section>
            )}

            {isFinished && (
              <section className="card p-4">
                <p className="text-sm">
                  {post.status === POST_STATUS.PUBLISHED
                    ? dict.postWorkspace.review.publishedMessage
                    : dict.postWorkspace.review.rejectedMessage}
                </p>
              </section>
            )}

            {/* Histórico */}
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">
                {dict.postWorkspace.history.heading} ({post.versions.length})
              </h2>
              <ol className="space-y-2.5">
                {post.versions.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">v{v.versionNumber}</span>{" "}
                      <span className="text-muted">· {originLabel(v.origin, dict.postWorkspace.origin)}</span>
                      {v.aiProvider && (
                        <span className="text-muted"> · {aiSourceLabel(v.aiProvider, dict.postWorkspace.aiSource)}</span>
                      )}
                      {v.decisions.map((d) => (
                        <div key={d.id} className="text-xs text-muted">
                          {decisionLabel(d.decision, dict.postWorkspace.decision)} {dict.postWorkspace.header.byLabel}{" "}
                          {d.reviewer.name}
                          {d.reason ? ` — “${d.reason}”` : ""}
                        </div>
                      ))}
                    </div>
                    <span className="shrink-0 text-xs text-faint">
                      {new Date(v.createdAt).toLocaleString(dateLocale, {
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

      {photoPickerQuery !== null && (
        <PhotoPickerModal
          key={photoPickerQuery}
          initialQuery={photoPickerQuery}
          onClose={() => setPhotoPickerQuery(null)}
          onPick={importPexelsPhoto}
        />
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
  const { dict } = useLocale();
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
      <span aria-hidden className="text-2xl">📷</span>
      <p className="text-sm font-medium">
        {busy ? dict.postWorkspace.photoUploader.sending : dict.postWorkspace.photoUploader.dragOrTap}
      </p>
      <p className="text-xs text-muted">
        {dict.postWorkspace.photoUploader.formatsPrefix} {MAX_PHOTO_MB} {dict.postWorkspace.photoUploader.mbSuffix}
      </p>
    </div>
  );
}

/** Mesma ideia do PhotoUploader, pro vídeo (formato/teto diferentes). */
function VideoUploader({
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
  const { dict } = useLocale();
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
      <span aria-hidden className="text-2xl">▶️</span>
      <p className="text-sm font-medium">
        {busy ? dict.postWorkspace.videoUploader.sending : dict.postWorkspace.videoUploader.dragOrTap}
      </p>
      <p className="text-xs text-muted">
        {dict.postWorkspace.videoUploader.formatsPrefix} {MAX_VIDEO_MB} {dict.postWorkspace.videoUploader.mbSuffix}
      </p>
    </div>
  );
}

/**
 * Exatamente 2 sugestões de busca geradas pela IA — só ajudam a achar uma
 * imagem; nunca escolhem, baixam ou publicam nada sozinhas.
 *
 * "Google Imagens" sempre abre numa aba nova — a página de resultados do
 * Google bloqueia iframe e não existe API gratuita equivalente, então dá
 * pra achar a foto real do fato, mas não pra embutir/automatizar isso.
 *
 * "Fotos gratuitas" (Pexels) já é embutido quando `onSearchPhotos` é
 * passado (abre o PhotoPickerModal — busca, escolhe, a foto já entra na
 * arte, sem sair do site). Sem esse callback (revisão de colega, só
 * visualização), cai pro link de sempre em aba nova.
 */
function ImageSuggestions({
  suggestions,
  onSearchPhotos,
}: {
  suggestions: string[];
  onSearchPhotos?: (query: string) => void;
}) {
  const { dict } = useLocale();
  if (!suggestions.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">
        {dict.postWorkspace.imageSuggestions.heading}
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
                className="btn-ghost btn-sm gap-1.5"
              >
                <GoogleIcon />
                {dict.postWorkspace.imageSuggestions.googleImages}
              </a>
              {onSearchPhotos ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => onSearchPhotos(q)}
                >
                  {dict.postWorkspace.imageSuggestions.freePhotos}
                </button>
              ) : (
                <a
                  href={freePhotosUrl(q)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost btn-sm"
                >
                  {dict.postWorkspace.imageSuggestions.freePhotos}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Logo oficial multicolor do Google — mantém as cores de marca em qualquer tema. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.617z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

interface PexelsPhoto {
  id: number;
  thumbnailUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
}

type PhotoSearchResponse =
  | { enabled: false }
  | { enabled: true; photos: PexelsPhoto[]; nextPage: number | null };

/**
 * Busca embutida no Pexels, aberta a partir de uma sugestão da IA (query já
 * preenchida, editável). Mostra a grade de fotos sem sair do site; clicar
 * numa já baixa (server-side, via /photo-search/import) e anexa ao post
 * (`onPick`, o mesmo final do addPhoto normal). Sem PEXELS_API_KEY
 * configurada, cai pro link de sempre em aba nova.
 */
function PhotoPickerModal({
  initialQuery,
  onClose,
  onPick,
}: {
  initialQuery: string;
  onClose: () => void;
  onPick: (downloadUrl: string) => Promise<void>;
}) {
  const { dict } = useLocale();
  const t = dict.postWorkspace.photoPicker;
  const [q, setQ] = useState(initialQuery);
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<number | null>(null);

  const search = useCallback(async (query: string, page: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<PhotoSearchResponse>(
        `/api/photo-search?q=${encodeURIComponent(query)}&page=${page}`,
      );
      if (!res.enabled) {
        setEnabled(false);
        return;
      }
      setPhotos((prev) => (append ? [...prev, ...res.photos] : res.photos));
      setNextPage(res.nextPage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search(initialQuery, 1, false);
    // Só na abertura — buscas seguintes (novo termo, "carregar mais") vêm
    // de ações explícitas do usuário, não de mudança de prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(photo: PexelsPhoto) {
    setPickingId(photo.id);
    setError(null);
    try {
      await onPick(photo.downloadUrl);
      onClose();
    } catch (err) {
      setError(`${t.importError}${(err as Error).message}`);
      setPickingId(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[85vh] w-full max-w-2xl flex-col p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-picker-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="photo-picker-title" className="text-sm font-semibold">
              🖼️ {t.title}
            </h2>
            <p className="hint mb-0 mt-0.5">{t.subtitle}</p>
          </div>
          <button
            type="button"
            className="btn-subtle btn-sm shrink-0"
            onClick={onClose}
            aria-label={t.closeLabel}
          >
            ✕
          </button>
        </div>

        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search(q, 1, false);
          }}
        >
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={loading || !q.trim()}>
            {t.searchButton}
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!enabled ? (
            <div className="alert-info space-y-2">
              <p className="font-medium">{t.notConfiguredTitle}</p>
              <p>{t.notConfiguredBody}</p>
              <a
                href={freePhotosUrl(initialQuery)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost btn-sm"
              >
                {t.openInNewTab}
              </a>
            </div>
          ) : (
            <>
              {error && <p className="alert-error mb-3">{error}</p>}
              {loading && photos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t.loading}</p>
              ) : photos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t.empty}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => pick(photo)}
                      disabled={pickingId !== null}
                      title={photo.alt}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-elevated transition-opacity disabled:cursor-wait"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.alt}
                        loading="lazy"
                        className={`h-full w-full object-cover transition-transform group-hover:scale-105 ${
                          pickingId === photo.id ? "opacity-40" : ""
                        }`}
                      />
                      {pickingId === photo.id && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white">
                          {t.importing}
                        </span>
                      )}
                      {photo.photographer && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-left text-[10px] text-white/90">
                          {t.photoCreditPrefix}{photo.photographer}{t.photoCreditSuffix}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {nextPage !== null && photos.length > 0 && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={loading}
                    onClick={() => search(q, nextPage, true)}
                  >
                    {loading ? t.loadingMore : t.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
function aiSourceLabel(provider: string, names: Record<string, string>): string {
  const base = provider.split(":")[0];
  return names[base] ?? base;
}

function originLabel(origin: string, origins: Record<string, string>): string {
  return origins[origin] ?? origin;
}

function decisionLabel(decision: string, decisions: Record<string, string>): string {
  return decisions[decision] ?? decision;
}
