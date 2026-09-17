"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api-client";
import { applyTextCase, type TextTransform } from "@/lib/text-case";
import { Tooltip } from "./Tooltip";
import { useLocale } from "./LocaleProvider";

/**
 * Formatos aceitos pelo feed do Instagram. 4:5 vem primeiro — é o formato
 * padrão da redação (ocupa mais tela no celular) e por isso o pré-selecionado
 * tanto aqui quanto na escolha de template do editor de arte.
 */
const FORMATS = [
  { id: "4:5", w: 1080, h: 1350 },
  { id: "1:1", w: 1080, h: 1080 },
] as const;

type Box = { x: number; y: number; width: number; height: number };
type SlotKey = "photo" | "title" | "subtitle";
type Drag = {
  kind: "move" | "resize";
  slot: SlotKey;
  startX: number;
  startY: number;
  orig: Box;
} | null;

interface FontCfg {
  fontSize: number;
  weight: 400 | 600 | 700;
  color: string;
  align: "left" | "center" | "right";
  transform: TextTransform;
}

const MIN = 40;

export function TemplateBuilder({ onCreated }: { onCreated?: () => void }) {
  const { dict } = useLocale();
  const [format, setFormat] = useState<(typeof FORMATS)[number]>(FORMATS[0]);
  const [name, setName] = useState("");
  const [overlayUrl, setOverlayUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [photo, setPhoto] = useState<Box>({ x: 0, y: 0, width: 1080, height: 1080 });
  const [title, setTitle] = useState<Box>({ x: 64, y: 700, width: 952, height: 120 });
  const [subtitle, setSubtitle] = useState<Box>({ x: 64, y: 840, width: 952, height: 90 });

  const [titleFont, setTitleFont] = useState<FontCfg>({
    fontSize: 38.2, weight: 600, color: "#ffffff", align: "left", transform: "none",
  });
  const [subFont, setSubFont] = useState<FontCfg>({
    fontSize: 24, weight: 400, color: "#ffffff", align: "left", transform: "none",
  });

  const [active, setActive] = useState<SlotKey>("title");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>(null);
  const [stageW, setStageW] = useState(0);
  const scale = stageW > 0 ? stageW / format.w : 0;

  // Ao trocar de formato, reposiciona proporcionalmente
  useEffect(() => {
    setPhoto({ x: 0, y: 0, width: format.w, height: format.h });
    setTitle({
      x: 64, y: Math.round(format.h * 0.648),
      width: format.w - 128, height: Math.round(format.h * 0.111),
    });
    setSubtitle({
      x: 64, y: Math.round(format.h * 0.778),
      width: format.w - 128, height: Math.round(format.h * 0.083),
    });
  }, [format]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => setStageW(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampBox = useCallback(
    (b: Box): Box => {
      const width = Math.min(Math.max(MIN, Math.round(b.width)), format.w);
      const height = Math.min(Math.max(MIN, Math.round(b.height)), format.h);
      return {
        width, height,
        x: Math.min(Math.max(0, Math.round(b.x)), format.w - width),
        y: Math.min(Math.max(0, Math.round(b.y)), format.h - height),
      };
    },
    [format],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || scale === 0) return;
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      const next =
        d.kind === "move"
          ? { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }
          : { ...d.orig, width: d.orig.width + dx, height: d.orig.height + dy };
      const box = clampBox(next);
      if (d.slot === "photo") setPhoto(box);
      else if (d.slot === "title") setTitle(box);
      else setSubtitle(box);
    };
    const onUp = () => (dragRef.current = null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scale, clampBox]);

  function startDrag(e: React.PointerEvent, kind: "move" | "resize", slot: SlotKey) {
    e.preventDefault();
    e.stopPropagation();
    setActive(slot);
    dragRef.current = {
      kind, slot,
      startX: e.clientX, startY: e.clientY,
      orig: slot === "photo" ? photo : slot === "title" ? title : subtitle,
    };
  }

  async function uploadOverlay(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "overlay");
      const { url } = await apiPost<{ url: string }>("/api/upload", fd);
      setOverlayUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/art-templates", {
        name,
        canvasWidth: format.w,
        canvasHeight: format.h,
        overlayAssetUrl: overlayUrl,
        photoSlot: photo,
        titleSlot: { ...title, ...titleFont, lineHeight: 1.25 },
        subtitleSlot: { ...subtitle, ...subFont, lineHeight: 1.3 },
      });
      setName("");
      setOverlayUrl("");
      onCreated?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const px = (v: number) => v * scale;
  const activeFont = active === "subtitle" ? subFont : titleFont;
  const setActiveFont = active === "subtitle" ? setSubFont : setTitleFont;

  return (
    <div className="space-y-5">
      {/* Como fazer a moldura */}
      <details className="card-soft p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {dict.templateBuilder.canvaGuide.title}
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
          <li>
            {dict.templateBuilder.canvaGuide.step1Prefix}{" "}
            <strong className="text-ink">1080×1080</strong>{" "}
            {dict.templateBuilder.canvaGuide.step1Middle}{" "}
            <strong className="text-ink">1080×1350</strong>{" "}
            {dict.templateBuilder.canvaGuide.step1Suffix}
          </li>
          <li>
            {dict.templateBuilder.canvaGuide.step2Prefix}{" "}
            <strong className="text-ink">
              {dict.templateBuilder.canvaGuide.step2Bold}
            </strong>{" "}
            {dict.templateBuilder.canvaGuide.step2Suffix}
          </li>
          <li>
            {dict.templateBuilder.canvaGuide.step3Prefix}{" "}
            <strong className="text-ink">{dict.templateBuilder.canvaGuide.step3Bold}</strong>{" "}
            {dict.templateBuilder.canvaGuide.step3Suffix}
          </li>
          <li>
            {dict.templateBuilder.canvaGuide.step4Prefix}{" "}
            <strong className="text-ink">{dict.templateBuilder.canvaGuide.step4Bold}</strong>
            {dict.templateBuilder.canvaGuide.step4Suffix}
          </li>
          <li>{dict.templateBuilder.canvaGuide.step5}</li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          {dict.templateBuilder.canvaGuide.footer}
        </p>
      </details>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ── Palco ─────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              {dict.templateBuilder.stage.heading}
              <Tooltip
                text={dict.templateBuilder.stage.tooltipText}
                where={dict.templateBuilder.stage.tooltipWhere}
              />
            </h3>
            <span className="text-xs text-faint">{format.w}×{format.h}px</span>
          </div>

          <div
            ref={stageRef}
            className="relative w-full select-none overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#1b1f26_0%_25%,#141820_0%_50%)] bg-[length:20px_20px]"
            style={{ aspectRatio: `${format.w} / ${format.h}` }}
          >
            {overlayUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={overlayUrl} alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
            )}

            <SlotBox
              label={dict.templateBuilder.slots.photo} color="brand" box={photo} px={px}
              activeSlot={active === "photo"}
              onMove={(e) => startDrag(e, "move", "photo")}
              onResize={(e) => startDrag(e, "resize", "photo")}
            />

            <SlotBox
              label={dict.templateBuilder.slots.title} color="amber" box={title} px={px}
              activeSlot={active === "title"}
              onMove={(e) => startDrag(e, "move", "title")}
              onResize={(e) => startDrag(e, "resize", "title")}
            >
              <PreviewText text={dict.templateBuilder.previewExample.title} font={titleFont} px={px} />
            </SlotBox>

            <SlotBox
              label={dict.templateBuilder.slots.subtitle} color="emerald" box={subtitle} px={px}
              activeSlot={active === "subtitle"}
              onMove={(e) => startDrag(e, "move", "subtitle")}
              onResize={(e) => startDrag(e, "resize", "subtitle")}
            >
              <PreviewText text={dict.templateBuilder.previewExample.subtitle} font={subFont} px={px} />
            </SlotBox>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm"
              onClick={() => setPhoto({ x: 0, y: 0, width: format.w, height: format.h })}>
              {dict.templateBuilder.stage.fillPhoto}
            </button>
            <button className="btn-ghost btn-sm"
              onClick={() => {
                setTitle((t) => clampBox({ ...t, x: Math.round((format.w - t.width) / 2) }));
                setSubtitle((s) => clampBox({ ...s, x: Math.round((format.w - s.width) / 2) }));
              }}>
              {dict.templateBuilder.stage.centerTexts}
            </button>
          </div>
        </div>

        {/* ── Controles ─────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="tpl-name">
              {dict.templateBuilder.nameField.label}
              <Tooltip text={dict.templateBuilder.nameField.tooltip} />
            </label>
            <input id="tpl-name" className="input" value={name}
              onChange={(e) => setName(e.target.value)} placeholder={dict.templateBuilder.nameField.placeholder} />
          </div>

          <div>
            <span className="label">{dict.templateBuilder.formatField.label}</span>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => {
                const meta = dict.templateBuilder.formats[f.id];
                return (
                  <button key={f.id} type="button" onClick={() => setFormat(f)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      format.id === f.id
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-line bg-elevated hover:border-brand-500/50"
                    }`}>
                    <span className="block text-sm font-semibold">{meta.label}</span>
                    <span className="block text-[11px] text-muted">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">
              {dict.templateBuilder.overlayField.label}
              <Tooltip
                text={dict.templateBuilder.overlayField.tooltipText}
                where={dict.templateBuilder.overlayField.tooltipWhere}
              />
            </label>
            <input type="file" accept="image/png"
              onChange={(e) => e.target.files?.[0] && uploadOverlay(e.target.files[0])}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0
                         file:bg-brand-500/15 file:px-3 file:py-2 file:text-sm file:font-medium
                         file:text-brand-300" />
            {uploading && <p className="hint">{dict.templateBuilder.overlayField.uploading}</p>}
            {overlayUrl && <p className="hint text-emerald-400">{dict.templateBuilder.overlayField.uploaded}</p>}
          </div>

          {/* Estilo do slot de texto selecionado */}
          <fieldset className="card-soft space-y-3 p-3">
            <legend className="px-1 text-xs font-semibold text-muted">
              {dict.templateBuilder.textStyle.legend}
            </legend>

            <div className="grid grid-cols-2 gap-2">
              {(["title", "subtitle"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setActive(k)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                    active === k
                      ? "border-brand-500 bg-brand-500/10 text-brand-300"
                      : "border-line bg-elevated text-muted hover:text-ink"
                  }`}>
                  {k === "title" ? dict.templateBuilder.textStyle.tabTitle : dict.templateBuilder.textStyle.tabSubtitle}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs" htmlFor="fs">{dict.templateBuilder.textStyle.sizeLabel}</label>
                <input id="fs" type="number" step="0.1" className="input"
                  value={activeFont.fontSize}
                  onChange={(e) => setActiveFont({ ...activeFont, fontSize: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label text-xs" htmlFor="fc">{dict.templateBuilder.textStyle.colorLabel}</label>
                <input id="fc" type="color" value={activeFont.color}
                  onChange={(e) => setActiveFont({ ...activeFont, color: e.target.value })}
                  className="h-11 w-full cursor-pointer rounded-xl border border-line bg-elevated p-1" />
              </div>
            </div>

            <div>
              <label className="label text-xs" htmlFor="fw">{dict.templateBuilder.textStyle.weightLabel}</label>
              <select id="fw" className="input" value={activeFont.weight}
                onChange={(e) => setActiveFont({ ...activeFont, weight: Number(e.target.value) as 400 | 600 | 700 })}>
                <option value={400}>{dict.templateBuilder.textStyle.weightRegular}</option>
                <option value={600}>{dict.templateBuilder.textStyle.weightSemiBold}</option>
                <option value={700}>{dict.templateBuilder.textStyle.weightBold}</option>
              </select>
            </div>

            <div>
              <span className="label text-xs">{dict.templateBuilder.textStyle.alignLabel}</span>
              <div className="grid grid-cols-3 gap-2">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} type="button"
                    onClick={() => setActiveFont({ ...activeFont, align: a })}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      activeFont.align === a
                        ? "border-brand-500 bg-brand-500/10 text-brand-300"
                        : "border-line bg-elevated text-muted hover:text-ink"
                    }`}>
                    {a === "left" ? dict.templateBuilder.textStyle.alignLeft : a === "center" ? dict.templateBuilder.textStyle.alignCenter : dict.templateBuilder.textStyle.alignRight}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label text-xs" htmlFor="ft">
                {dict.templateBuilder.textStyle.caseLabel}
                <Tooltip text={dict.templateBuilder.textStyle.caseTooltip} />
              </label>
              <select id="ft" className="input" value={activeFont.transform}
                onChange={(e) => setActiveFont({ ...activeFont, transform: e.target.value as FontCfg["transform"] })}>
                <option value="none">{dict.templateBuilder.textStyle.caseNone}</option>
                <option value="sentence">{dict.templateBuilder.textStyle.caseSentence}</option>
                <option value="capitalize">{dict.templateBuilder.textStyle.caseCapitalize}</option>
                <option value="uppercase">{dict.templateBuilder.textStyle.caseUppercase}</option>
              </select>
            </div>
          </fieldset>

          <div className="card-soft p-3 text-xs text-muted">
            <div className="mb-1 font-semibold text-ink">{dict.templateBuilder.measurements.heading}</div>
            <div>{dict.templateBuilder.measurements.photoLabel} — x {photo.x} · y {photo.y} · {photo.width}×{photo.height}</div>
            <div>{dict.templateBuilder.measurements.titleLabel} — x {title.x} · y {title.y} · {title.width}×{title.height}</div>
            <div>{dict.templateBuilder.measurements.subtitleLabel} — x {subtitle.x} · y {subtitle.y} · {subtitle.width}×{subtitle.height}</div>
          </div>

          {error && <p className="alert-error">{error}</p>}

          <button className="btn-primary w-full" onClick={save}
            disabled={busy || !name || !overlayUrl}>
            {busy ? dict.templateBuilder.saveButton.saving : dict.templateBuilder.saveButton.create}
          </button>
          {!overlayUrl && <p className="hint text-center">{dict.templateBuilder.saveButton.enableHint}</p>}
        </div>
      </div>
    </div>
  );
}

function PreviewText({
  text, font, px,
}: { text: string; font: FontCfg; px: (v: number) => number }) {
  const shown = applyTextCase(text, font.transform);
  return (
    <span
      className="pointer-events-none block w-full px-0.5 font-art leading-tight"
      style={{
        fontSize: Math.max(7, px(font.fontSize)),
        color: font.color,
        textAlign: font.align,
        fontWeight: font.weight,
      }}
    >
      {shown}
    </span>
  );
}

function SlotBox({
  label, color, box, px, activeSlot, onMove, onResize, children,
}: {
  label: string;
  color: "brand" | "amber" | "emerald";
  box: Box;
  px: (v: number) => number;
  activeSlot: boolean;
  onMove: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  children?: React.ReactNode;
}) {
  const c = {
    brand: { border: "border-brand-400", bg: "bg-brand-500/10", chip: "bg-brand-500" },
    amber: { border: "border-amber-400", bg: "bg-amber-500/10", chip: "bg-amber-500" },
    emerald: { border: "border-emerald-400", bg: "bg-emerald-500/10", chip: "bg-emerald-500" },
  }[color];

  return (
    <div
      onPointerDown={onMove}
      className={`absolute cursor-move touch-none border-2 border-dashed ${c.border} ${c.bg} ${
        activeSlot ? "z-20 ring-2 ring-white/20" : "z-10"
      }`}
      style={{
        left: px(box.x), top: px(box.y),
        width: px(box.width), height: px(box.height),
      }}
    >
      <span className={`absolute -top-2 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white ${c.chip}`}>
        {label}
      </span>
      <div className="flex h-full w-full items-center overflow-hidden">{children}</div>
      <span
        onPointerDown={onResize}
        className={`absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize touch-none rounded-full border-2 border-white ${c.chip}`}
      />
    </div>
  );
}
