"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api-client";
import { applyTextCase, type TextTransform } from "@/lib/text-case";

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  weight?: number;
  lineHeight?: number;
  transform?: TextTransform;
  [k: string]: unknown;
}

export interface EditorTemplate {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  overlayAssetUrl: string;
  photoSlot: Slot;
  titleSlot: Slot;
  subtitleSlot: Slot | null;
}

export interface EditorPhoto {
  id: string;
  storageUrl: string;
}

type Offset = { offsetX: number; offsetY: number };
type TextKind = "title" | "subtitle";

interface Props {
  postId: string;
  photos: EditorPhoto[];
  templates: EditorTemplate[];
  initial?: {
    selectedPhotoId?: string | null;
    artTemplateId?: string | null;
    photoTransform?: { offsetX: number; offsetY: number; scale: number } | null;
    title?: string | null;
    subtitle?: string | null;
    titleOffset?: Offset | null;
    subtitleOffset?: Offset | null;
  };
  onSaved?: () => void;
}

type Transform = { offsetX: number; offsetY: number; scale: number };
const ZERO_OFFSET: Offset = { offsetX: 0, offsetY: 0 };

export const TITLE_MAX = 69;
export const SUBTITLE_MAX = 149;

export function ArtEditor({ postId, photos, templates, initial, onSaved }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const fx = useRef<{
    canvas: any;
    image: any;
    titleBox: any;
    subtitleBox: any;
    dispScale: number;
    coverScaleDisp: number;
    slot: { x: number; y: number; w: number; h: number };
    nW: number;
    nH: number;
  } | null>(null);

  // Refs persistem o ajuste entre reconstruções do canvas (troca de foto/template).
  const transformRef = useRef<Transform>(
    initial?.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 },
  );
  const titleOffsetRef = useRef<Offset>(initial?.titleOffset ?? ZERO_OFFSET);
  const subtitleOffsetRef = useRef<Offset>(initial?.subtitleOffset ?? ZERO_OFFSET);

  const [displayW, setDisplayW] = useState(0);
  const [photoId, setPhotoId] = useState(
    initial?.selectedPhotoId ?? photos[0]?.id ?? "",
  );
  const [templateId, setTemplateId] = useState(
    initial?.artTemplateId ?? templates[0]?.id ?? "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [zoom, setZoom] = useState(transformRef.current.scale);
  const [textMoved, setTextMoved] = useState(
    hasOffset(titleOffsetRef.current) || hasOffset(subtitleOffsetRef.current),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const photo = photos.find((p) => p.id === photoId) ?? photos[0];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = Math.floor(el.clientWidth);
      setDisplayW((prev) => (Math.abs(prev - w) > 8 ? w : prev));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamp = useCallback(() => {
    const r = fx.current;
    if (!r) return;
    const img = r.image;
    if (img.scaleX < r.coverScaleDisp) {
      img.set({ scaleX: r.coverScaleDisp, scaleY: r.coverScaleDisp });
    }
    if (img.scaleY !== img.scaleX) img.set({ scaleY: img.scaleX });

    const w = r.nW * img.scaleX;
    const h = r.nH * img.scaleX;
    img.set({
      left: Math.min(r.slot.x, Math.max(r.slot.x + r.slot.w - w, img.left)),
      top: Math.min(r.slot.y, Math.max(r.slot.y + r.slot.h - h, img.top)),
    });
    img.setCoords();
  }, []);

  const readTransform = useCallback((): Transform => {
    const r = fx.current;
    if (!r) return transformRef.current;
    const img = r.image;
    const w = r.nW * img.scaleX;
    const h = r.nH * img.scaleX;
    return {
      offsetX: (img.left - r.slot.x - (r.slot.w - w) / 2) / r.dispScale,
      offsetY: (img.top - r.slot.y - (r.slot.h - h) / 2) / r.dispScale,
      scale: img.scaleX / r.coverScaleDisp,
    };
  }, []);

  /** Lê o deslocamento atual de um texto em relação à posição padrão do template. */
  const readTextOffset = useCallback(
    (kind: TextKind): Offset => {
      const r = fx.current;
      const box = kind === "title" ? r?.titleBox : r?.subtitleBox;
      const slotDef = kind === "title" ? template?.titleSlot : template?.subtitleSlot;
      if (!r || !box || !slotDef) {
        return kind === "title" ? titleOffsetRef.current : subtitleOffsetRef.current;
      }
      return {
        offsetX: (box.left - slotDef.x * r.dispScale) / r.dispScale,
        offsetY: (box.top - slotDef.y * r.dispScale) / r.dispScale,
      };
    },
    [template],
  );

  // (Re)constrói o canvas
  useEffect(() => {
    if (!canvasEl.current || !template || !photo || displayW <= 0) return;
    let dead = false;

    (async () => {
      const fabric = await import("fabric");
      if (dead) return;

      const dispScale = displayW / template.canvasWidth;
      const displayH = template.canvasHeight * dispScale;

      fx.current?.canvas?.dispose?.();

      const canvas = new fabric.Canvas(canvasEl.current!, {
        width: displayW,
        height: displayH,
        backgroundColor: "#000",
        selection: false,
        preserveObjectStacking: true,
        uniformScaling: true,
        uniScaleKey: null,
      });

      const ps = template.photoSlot;
      const slot = {
        x: ps.x * dispScale,
        y: ps.y * dispScale,
        w: ps.width * dispScale,
        h: ps.height * dispScale,
      };

      const img = await fabric.FabricImage.fromURL(photo.storageUrl, {
        crossOrigin: "anonymous",
      });
      const nW = img.width ?? 1;
      const nH = img.height ?? 1;
      const coverScaleDisp = Math.max(slot.w / nW, slot.h / nH);

      const t = transformRef.current;
      const s = coverScaleDisp * Math.max(1, t.scale || 1);
      img.set({
        scaleX: s,
        scaleY: s,
        left: slot.x + (slot.w - nW * s) / 2 + (t.offsetX || 0) * dispScale,
        top: slot.y + (slot.h - nH * s) / 2 + (t.offsetY || 0) * dispScale,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        lockSkewingX: true,
        lockSkewingY: true,
        cornerColor: "#4d7cff",
        cornerStrokeColor: "#fff",
        cornerSize: 14,
        transparentCorners: false,
        borderColor: "#4d7cff",
      });
      img.setControlsVisibility({
        ml: false, mr: false, mt: false, mb: false, mtr: false,
      });
      img.clipPath = new fabric.Rect({
        left: slot.x, top: slot.y, width: slot.w, height: slot.h,
        absolutePositioned: true,
      });
      canvas.add(img);

      const overlay = await fabric.FabricImage.fromURL(template.overlayAssetUrl, {
        crossOrigin: "anonymous",
      });
      overlay.set({
        left: 0, top: 0,
        scaleX: displayW / (overlay.width ?? displayW),
        scaleY: displayH / (overlay.height ?? displayH),
        selectable: false, evented: false,
      });
      canvas.add(overlay);

      // Texto arrastável — só MOVE (sem redimensionar/rotacionar, pra manter
      // fonte e largura do template). O deslocamento é salvo por post; o
      // template em si nunca muda.
      const mkText = (slotDef: Slot, value: string, offset: Offset, color: string) => {
        const box = new fabric.Textbox(applyTextCase(value, slotDef.transform), {
          left: slotDef.x * dispScale + offset.offsetX * dispScale,
          top: slotDef.y * dispScale + offset.offsetY * dispScale,
          width: slotDef.width * dispScale,
          fontSize: (slotDef.fontSize ?? 38.2) * dispScale,
          fill: slotDef.color ?? "#ffffff",
          textAlign: slotDef.align ?? "left",
          fontFamily: "Poppins",
          fontWeight: slotDef.weight ?? 600,
          lineHeight: slotDef.lineHeight ?? 1.25,
          selectable: true,
          evented: true,
          hasControls: false,
          hasBorders: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          borderColor: color,
          editable: false,
        });
        return box;
      };

      const titleBox = mkText(template.titleSlot, title, titleOffsetRef.current, "#f59e0b");
      canvas.add(titleBox);

      let subtitleBox = null;
      if (template.subtitleSlot) {
        subtitleBox = mkText(
          template.subtitleSlot, subtitle, subtitleOffsetRef.current, "#10b981",
        );
        canvas.add(subtitleBox);
      }

      fx.current = {
        canvas, image: img, titleBox, subtitleBox,
        dispScale, coverScaleDisp, slot, nW, nH,
      };
      clamp();
      canvas.renderAll();

      const sync = (e?: { target?: any }) => {
        const target = e?.target;
        if (!target || target === img) {
          clamp();
          transformRef.current = readTransform();
          setZoom(transformRef.current.scale);
        }
        if (target === titleBox) {
          titleOffsetRef.current = readTextOffset("title");
          setTextMoved(hasOffset(titleOffsetRef.current) || hasOffset(subtitleOffsetRef.current));
        }
        if (target === subtitleBox) {
          subtitleOffsetRef.current = readTextOffset("subtitle");
          setTextMoved(hasOffset(titleOffsetRef.current) || hasOffset(subtitleOffsetRef.current));
        }
        canvas.renderAll();
      };
      canvas.on("object:moving", sync);
      canvas.on("object:scaling", sync);
      canvas.on("object:modified", sync);
    })();

    return () => {
      dead = true;
      fx.current?.canvas?.dispose?.();
      fx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId, templateId, displayW]);

  // Texto em tempo real no preview
  useEffect(() => {
    const r = fx.current;
    if (r?.titleBox) {
      r.titleBox.set({ text: applyTextCase(title, template?.titleSlot.transform) });
      r.canvas.renderAll();
    }
  }, [title, template]);

  useEffect(() => {
    const r = fx.current;
    if (r?.subtitleBox) {
      r.subtitleBox.set({
        text: applyTextCase(subtitle, template?.subtitleSlot?.transform),
      });
      r.canvas.renderAll();
    }
  }, [subtitle, template]);

  function applyZoom(next: number) {
    const r = fx.current;
    setZoom(next);
    if (!r) return;
    const img = r.image;
    const cx = r.slot.x + r.slot.w / 2;
    const cy = r.slot.y + r.slot.h / 2;
    const relX = (cx - img.left) / (r.nW * img.scaleX);
    const relY = (cy - img.top) / (r.nH * img.scaleX);
    const s = r.coverScaleDisp * next;
    img.set({
      scaleX: s, scaleY: s,
      left: cx - relX * r.nW * s,
      top: cy - relY * r.nH * s,
    });
    clamp();
    transformRef.current = readTransform();
    r.canvas.renderAll();
  }

  /** Volta o título ou o subtítulo pra posição padrão do template. */
  function resetTextPosition(kind: TextKind) {
    const r = fx.current;
    const slotDef = kind === "title" ? template?.titleSlot : template?.subtitleSlot;
    const box = kind === "title" ? r?.titleBox : r?.subtitleBox;
    if (kind === "title") titleOffsetRef.current = ZERO_OFFSET;
    else subtitleOffsetRef.current = ZERO_OFFSET;
    if (r && box && slotDef) {
      box.set({ left: slotDef.x * r.dispScale, top: slotDef.y * r.dispScale });
      box.setCoords();
      r.canvas.renderAll();
    }
    setTextMoved(hasOffset(titleOffsetRef.current) || hasOffset(subtitleOffsetRef.current));
  }

  async function save() {
    if (!template || !photo) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/posts/${postId}/art`, {
        selectedPhotoId: photo.id,
        artTemplateId: template.id,
        photoTransform: readTransform(),
        title: title.slice(0, TITLE_MAX),
        subtitle: subtitle.slice(0, SUBTITLE_MAX),
        titleOffset: readTextOffset("title"),
        subtitleOffset: readTextOffset("subtitle"),
      });
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div ref={wrapRef} className="mx-auto w-full max-w-[420px]">
        <canvas ref={canvasEl} className="w-full touch-none rounded-xl border border-line" />
      </div>
      <p className="text-center text-xs text-muted">
        Arraste a foto para enquadrar. Arraste o{" "}
        <span className="text-amber-400">título</span> ou o{" "}
        <span className="text-emerald-400">subtítulo</span> para reposicionar o
        texto — o template continua igual, só muda nesta pauta.
      </p>

      <div className="card-soft p-3">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="zoom" className="text-xs font-medium text-muted">Zoom da foto</label>
          <span className="text-xs tabular-nums text-faint">{zoom.toFixed(2)}×</span>
        </div>
        <input
          id="zoom" type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand-500"
        />
      </div>

      {textMoved && (
        <button type="button" className="btn-ghost btn-sm w-full" onClick={() => {
          resetTextPosition("title");
          resetTextPosition("subtitle");
        }}>
          ↺ Restaurar posição padrão do texto
        </button>
      )}

      <CharField
        id="art-title" label="Título na imagem" max={TITLE_MAX}
        value={title} onChange={setTitle}
        placeholder="Manchete curta e direta"
      />

      {template?.subtitleSlot && (
        <CharField
          id="art-subtitle" label="Subtítulo na imagem" max={SUBTITLE_MAX}
          value={subtitle} onChange={setSubtitle} rows={2}
          placeholder="Um detalhe que o título não contou"
        />
      )}

      {templates.length > 1 && (
        <div>
          <label className="label" htmlFor="tpl">Formato</label>
          <select
            id="tpl" className="input" value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.canvasWidth}×{t.canvasHeight})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="alert-error">{error}</p>}

      <button onClick={save} className="btn-primary w-full" disabled={saving}>
        {saving ? "Gerando a arte…" : "Salvar arte e revisar"}
      </button>
    </div>
  );
}

function hasOffset(o: Offset): boolean {
  return Math.abs(o.offsetX) > 0.5 || Math.abs(o.offsetY) > 0.5;
}

function CharField({
  id, label, value, onChange, max, rows = 2, placeholder,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; max: number;
  rows?: number; placeholder?: string;
}) {
  const over = value.length > max;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={id}>{label}</label>
        <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-faint"}`}>
          {value.length}/{max}
        </span>
      </div>
      <textarea
        id={id}
        className={`input resize-y font-art ${over ? "border-red-500/60" : ""}`}
        rows={rows}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
