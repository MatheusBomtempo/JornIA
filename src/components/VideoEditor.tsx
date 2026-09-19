"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api-client";
import { TITLE_MAX } from "./ArtEditor";
import { useLocale } from "./LocaleProvider";
import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_X,
  SAFE_RIGHT_ACTIONS,
  CONTENT_BOTTOM,
  CARD_WIDTH,
  CARD_PADDING_X,
  CARD_PADDING_Y,
  TITLE_FONT_SIZE,
  TITLE_LINE_HEIGHT,
  LOGO_HEIGHT,
  LOGO_GAP,
  cropLossRatio,
  needsBlurBackground,
  buildVideoCardStyles,
  DEFAULT_VIDEO_TEMPLATE,
  type VideoCardStyle,
  type CompanyBrandColors,
} from "@/lib/render/video-layout";

/** Cor de fundo do cartão como rgba — só a caixa fica translúcida, o texto não. */
function cardBackground(style: VideoCardStyle): string {
  const hex = style.cardFill.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${style.cardOpacity})`;
}

const VIDEO_TEMPLATE_ORDER: VideoCardStyle["id"][] = ["classic", "light", "bold"];

export interface EditorVideo {
  id: string;
  storageUrl: string;
  previewFrameUrl: string | null;
  width: number | null;
  height: number | null;
}

interface Props {
  postId: string;
  videos: EditorVideo[];
  companyLogoUrl?: string | null;
  companyBrandColors?: CompanyBrandColors;
  initial?: {
    selectedVideoId?: string | null;
    title?: string | null;
    titleOffsetY?: number | null;
    videoTemplate?: string | null;
  };
  onSaved?: () => void;
}

/** Acima disso o corte 9:16 come tanto da imagem que vale avisar. */
const CROP_WARN_RATIO = 0.25;
/** Quanto o jornalista pode subir/descer o bloco (px na escala 1080x1920). */
const OFFSET_RANGE = 420;

/**
 * Equivalente ao ArtEditor pro post de vídeo: sem slots de foto — só
 * escolher o vídeo, o texto que entra animado, o estilo do cartão (3 fixos,
 * ver buildVideoCardStyles) e a altura do bloco. O preview usa um frame REAL do
 * meio do vídeo (já no mesmo enquadramento 9:16 do servidor, fundo desfocado
 * incluso pra vídeos deitados) com as réguas da área segura do Reels por
 * cima, então o que aparece aqui é onde o texto de fato cai no vídeo
 * renderizado.
 */
export function VideoEditor({
  postId,
  videos,
  companyLogoUrl,
  companyBrandColors,
  initial,
  onSaved,
}: Props) {
  const { dict } = useLocale();
  const [videoId, setVideoId] = useState(
    initial?.selectedVideoId ?? videos[0]?.id ?? "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [offsetY, setOffsetY] = useState(initial?.titleOffsetY ?? 0);
  const [videoTemplate, setVideoTemplate] = useState<VideoCardStyle["id"]>(
    (initial?.videoTemplate as VideoCardStyle["id"]) ?? DEFAULT_VIDEO_TEMPLATE,
  );
  const [showGuides, setShowGuides] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const video = videos.find((v) => v.id === videoId) ?? videos[0];
  const cardStyles = buildVideoCardStyles(companyBrandColors);
  const style = cardStyles[videoTemplate];

  const cropLoss =
    video?.width && video?.height ? cropLossRatio(video.width, video.height) : 0;
  const isLandscape =
    video?.width && video?.height ? needsBlurBackground(video.width, video.height) : false;

  async function save() {
    if (!video) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/posts/${postId}/video`, {
        selectedVideoId: video.id,
        title: title.slice(0, TITLE_MAX),
        titleOffsetY: offsetY,
        videoTemplate,
      });
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Tudo no preview é % do canvas 1080x1920 — assim escala com a largura da
  // tela sem perder a correspondência com o render do servidor.
  const pct = (px: number, total: number) => `${(px / total) * 100}%`;

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[320px]">
        <div
          className="relative overflow-hidden rounded-xl border border-line bg-black"
          // container-type: size faz `cqw`/`cqh` medirem ESTE box — é o que
          // mantém a fonte e a logo do preview na mesma proporção do 1080x1920.
          style={{
            aspectRatio: `${VIDEO_WIDTH} / ${VIDEO_HEIGHT}`,
            containerType: "size",
          }}
        >
          {video?.previewFrameUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.previewFrameUrl}
              alt={dict.videoEditor.previewAlt}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-faint">
              {dict.videoEditor.noPreviewFrame}
            </div>
          )}

          {/* Réguas: faixas que a UI do Reels cobre. */}
          {showGuides && (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-amber-400/70 bg-amber-400/15"
                style={{ height: pct(SAFE_TOP, VIDEO_HEIGHT) }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-amber-400/70 bg-amber-400/15"
                style={{ height: pct(SAFE_BOTTOM, VIDEO_HEIGHT) }}
              >
                <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] font-medium uppercase tracking-wide text-amber-200/90">
                  {dict.videoEditor.guideBottom}
                </span>
              </div>
              <div
                className="pointer-events-none absolute bottom-0 right-0 border-l border-dashed border-amber-400/50 bg-amber-400/10"
                style={{
                  width: pct(SAFE_RIGHT_ACTIONS, VIDEO_WIDTH),
                  top: pct(SAFE_TOP, VIDEO_HEIGHT),
                }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 left-0 border-r border-dashed border-amber-400/40"
                style={{ width: pct(SAFE_X, VIDEO_WIDTH) }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 border-l border-dashed border-amber-400/40"
                style={{ width: pct(SAFE_X, VIDEO_WIDTH) }}
              />
            </>
          )}

          {/* Bloco de texto + logo, ancorado no fim da área segura. */}
          <div
            className="absolute flex flex-col items-center"
            style={{
              left: pct(SAFE_X, VIDEO_WIDTH),
              width: pct(CARD_WIDTH, VIDEO_WIDTH),
              bottom: pct(VIDEO_HEIGHT - CONTENT_BOTTOM - offsetY, VIDEO_HEIGHT),
            }}
          >
            <div
              className="w-full overflow-hidden text-center font-art font-bold leading-tight transition-colors duration-200"
              style={{
                backgroundColor: cardBackground(style),
                borderRadius: `${(style.cardRadius / VIDEO_WIDTH) * 100}cqw`,
                border: style.cardBorder ? `1px solid ${style.cardBorder}` : undefined,
              }}
            >
              {style.accentColor && style.accentHeight > 0 && (
                <div
                  style={{
                    height: `${(style.accentHeight / VIDEO_HEIGHT) * 100}cqh`,
                    backgroundColor: style.accentColor,
                  }}
                />
              )}
              <div
                style={{
                  color: style.textColor,
                  padding: `${(CARD_PADDING_Y / VIDEO_HEIGHT) * 100}% ${(CARD_PADDING_X / VIDEO_WIDTH) * 100}%`,
                  fontSize: `${(TITLE_FONT_SIZE / VIDEO_WIDTH) * 100}cqw`,
                  lineHeight: TITLE_LINE_HEIGHT,
                }}
              >
                {title || dict.videoEditor.titleFieldPlaceholder}
              </div>
            </div>
            {companyLogoUrl && (
              <div style={{ marginTop: `${(LOGO_GAP / VIDEO_HEIGHT) * 100}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={companyLogoUrl}
                  alt=""
                  className="object-contain"
                  style={{ height: `${(LOGO_HEIGHT / VIDEO_HEIGHT) * 100}cqh` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted">{dict.videoEditor.previewHint}</p>

      {isLandscape ? (
        <p className="alert-info">
          {dict.videoEditor.letterboxInfoPrefix} {video?.width}×{video?.height}
          {dict.videoEditor.letterboxInfoSuffix}
        </p>
      ) : (
        cropLoss > CROP_WARN_RATIO && (
          <p className="alert-info">
            {dict.videoEditor.cropWarningPrefix} {video?.width}×{video?.height}
            {dict.videoEditor.cropWarningSuffix.replace(
              "{pct}",
              String(Math.round(cropLoss * 100)),
            )}
          </p>
        )
      )}

      <div className="card-soft p-3">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="video-offset" className="text-xs font-medium text-muted">
            {dict.videoEditor.heightLabel}
          </label>
          <button
            type="button"
            className="text-xs text-muted hover:text-ink"
            onClick={() => setShowGuides((v) => !v)}
          >
            {showGuides ? dict.videoEditor.hideGuides : dict.videoEditor.showGuides}
          </button>
        </div>
        <input
          id="video-offset"
          type="range"
          min={-OFFSET_RANGE}
          max={OFFSET_RANGE}
          step={4}
          value={offsetY}
          onChange={(e) => setOffsetY(Number(e.target.value))}
          className={`
            h-3 w-full cursor-pointer appearance-none rounded-full bg-white/20
            [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
            [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-500
            [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer
          `}
        />
        <p className="hint">{dict.videoEditor.heightHint}</p>
      </div>

      <div>
        <label className="label">{dict.videoEditor.templateLabel}</label>
        <div className="grid grid-cols-3 gap-2">
          {VIDEO_TEMPLATE_ORDER.map((id) => {
            const s = cardStyles[id];
            const active = id === videoTemplate;
            const label =
              id === "classic"
                ? dict.videoEditor.templateClassic
                : id === "light"
                  ? dict.videoEditor.templateLight
                  : dict.videoEditor.templateBold;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setVideoTemplate(id)}
                aria-pressed={active}
                className={`overflow-hidden rounded-xl border-2 bg-gradient-to-b from-slate-600 to-slate-900 transition-all ${
                  active
                    ? "border-brand-500 ring-2 ring-brand-500/40"
                    : "border-line hover:border-brand-500/50"
                }`}
              >
                <div className="flex aspect-[9/16] w-full items-end p-2">
                  <div
                    className="w-full overflow-hidden text-center text-[7px] font-bold leading-tight"
                    style={{
                      backgroundColor: cardBackground(s),
                      borderRadius: `${s.cardRadius / 6}px`,
                      border: s.cardBorder ? `1px solid ${s.cardBorder}` : undefined,
                    }}
                  >
                    {s.accentColor && s.accentHeight > 0 && (
                      <div style={{ height: 2, backgroundColor: s.accentColor }} />
                    )}
                    <div style={{ color: s.textColor, padding: "5px 3px" }}>
                      {dict.videoEditor.titleFieldPlaceholder}
                    </div>
                  </div>
                </div>
                <div
                  className={`truncate px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight ${
                    active ? "text-brand-300" : "text-muted"
                  }`}
                >
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {videos.length > 1 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {videos.map((v) => {
            const active = v.id === videoId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVideoId(v.id)}
                aria-pressed={active}
                className={`overflow-hidden rounded-xl border-2 bg-black transition-all ${
                  active
                    ? "border-brand-500 ring-2 ring-brand-500/40"
                    : "border-line hover:border-brand-500/50"
                }`}
              >
                {v.previewFrameUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.previewFrameUrl} alt="" className="aspect-[9/16] w-full object-cover" />
                ) : (
                  <video src={v.storageUrl} className="aspect-[9/16] w-full object-cover" muted />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="video-title">
            {dict.videoEditor.titleFieldLabel}
          </label>
          <span className="text-xs tabular-nums text-faint">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
        <textarea
          id="video-title"
          className="input resize-y font-art"
          rows={2}
          value={title}
          maxLength={TITLE_MAX}
          placeholder={dict.videoEditor.titleFieldPlaceholder}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p className="hint">{dict.videoEditor.animationHint}</p>
      </div>

      {error && <p className="alert-error">{error}</p>}

      <button onClick={save} className="btn-primary w-full" disabled={saving || !video}>
        {saving ? dict.videoEditor.savingButton : dict.videoEditor.saveButton}
      </button>
    </div>
  );
}
