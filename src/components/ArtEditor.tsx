"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api-client";

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
  [k: string]: unknown;
}

export interface EditorTemplate {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  overlayAssetUrl: string;
  photoSlot: Slot;
  textSlot: Slot & {
    fontSize?: number;
    color?: string;
    align?: "left" | "center" | "right";
    font?: string;
  };
}

export interface EditorPhoto {
  id: string;
  storageUrl: string;
}

interface Props {
  postId: string;
  photos: EditorPhoto[];
  templates: EditorTemplate[];
  initial?: {
    selectedPhotoId?: string | null;
    artTemplateId?: string | null;
    photoTransform?: { offsetX: number; offsetY: number; scale: number } | null;
    artText?: string | null;
  };
  onSaved?: () => void;
}

const DISPLAY_WIDTH = 460;

export function ArtEditor({ postId, photos, templates, initial, onSaved }: Props) {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  // guarda instâncias do fabric sem forçar re-render
  const ref = useRef<{
    canvas: any;
    image: any;
    textbox: any;
    fabric: any;
    dispScale: number;
    coverScaleDisp: number;
    slotDisp: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const [photoId, setPhotoId] = useState(
    initial?.selectedPhotoId ?? photos[0]?.id ?? "",
  );
  const [templateId, setTemplateId] = useState(
    initial?.artTemplateId ?? templates[0]?.id ?? "",
  );
  const [artText, setArtText] = useState(initial?.artText ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const photo = photos.find((p) => p.id === photoId);

  // (Re)constrói o canvas quando muda a foto ou o template.
  useEffect(() => {
    if (!canvasEl.current || !template || !photo) return;
    let disposed = false;

    (async () => {
      const fabric = await import("fabric");
      if (disposed) return;

      const dispScale = DISPLAY_WIDTH / template.canvasWidth;
      const displayHeight = template.canvasHeight * dispScale;

      // limpa canvas anterior
      ref.current?.canvas?.dispose?.();

      const canvas = new fabric.Canvas(canvasEl.current!, {
        width: DISPLAY_WIDTH,
        height: displayHeight,
        backgroundColor: "#111",
        selection: false,
        preserveObjectStacking: true,
      });

      const slot = template.photoSlot;
      const slotDisp = {
        x: slot.x * dispScale,
        y: slot.y * dispScale,
        w: slot.width * dispScale,
        h: slot.height * dispScale,
      };

      const img = await fabric.FabricImage.fromURL(photo.storageUrl, {
        crossOrigin: "anonymous",
      });
      const nW = img.width ?? 1;
      const nH = img.height ?? 1;
      const coverScaleDisp = Math.max(slotDisp.w / nW, slotDisp.h / nH);

      const t = initial?.photoTransform ?? { offsetX: 0, offsetY: 0, scale: 1 };
      const scaleDisp = coverScaleDisp * (t.scale || 1);
      img.set({
        scaleX: scaleDisp,
        scaleY: scaleDisp,
        left:
          slotDisp.x +
          (slotDisp.w - nW * scaleDisp) / 2 +
          (t.offsetX || 0) * dispScale,
        top:
          slotDisp.y +
          (slotDisp.h - nH * scaleDisp) / 2 +
          (t.offsetY || 0) * dispScale,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        cornerColor: "#3366ff",
        borderColor: "#3366ff",
      });
      img.setControlsVisibility({ mtr: false });

      // recorta a foto à área do slot
      img.clipPath = new fabric.Rect({
        left: slotDisp.x,
        top: slotDisp.y,
        width: slotDisp.w,
        height: slotDisp.h,
        absolutePositioned: true,
      });
      canvas.add(img);

      // overlay do template (não interativo) por cima
      const overlay = await fabric.FabricImage.fromURL(template.overlayAssetUrl, {
        crossOrigin: "anonymous",
      });
      overlay.set({
        left: 0,
        top: 0,
        scaleX: DISPLAY_WIDTH / (overlay.width ?? DISPLAY_WIDTH),
        scaleY: displayHeight / (overlay.height ?? displayHeight),
        selectable: false,
        evented: false,
      });
      canvas.add(overlay);

      // texto da arte (preview não interativo)
      const ts = template.textSlot;
      const textbox = new fabric.Textbox(artText, {
        left: ts.x * dispScale,
        top: ts.y * dispScale,
        width: ts.width * dispScale,
        fontSize: (ts.fontSize ?? 48) * dispScale,
        fill: ts.color ?? "#ffffff",
        textAlign: ts.align ?? "left",
        fontFamily: ts.font ?? "sans-serif",
        fontWeight: 700,
        selectable: false,
        evented: false,
      });
      canvas.add(textbox);
      canvas.renderAll();

      ref.current = {
        canvas,
        image: img,
        textbox,
        fabric,
        dispScale,
        coverScaleDisp,
        slotDisp,
      };
    })();

    return () => {
      disposed = true;
      ref.current?.canvas?.dispose?.();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId, templateId]);

  // sincroniza o texto da arte no preview
  useEffect(() => {
    const r = ref.current;
    if (r?.textbox) {
      r.textbox.set({ text: artText });
      r.canvas.renderAll();
    }
  }, [artText]);

  function computeTransform() {
    const r = ref.current;
    if (!r) return { offsetX: 0, offsetY: 0, scale: 1 };
    const img = r.image;
    const displayedW = img.getScaledWidth();
    const displayedH = img.getScaledHeight();
    return {
      offsetX:
        (img.left - r.slotDisp.x - (r.slotDisp.w - displayedW) / 2) /
        r.dispScale,
      offsetY:
        (img.top - r.slotDisp.y - (r.slotDisp.h - displayedH) / 2) /
        r.dispScale,
      scale: img.scaleX / r.coverScaleDisp,
    };
  }

  async function save() {
    if (!template || !photo) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/posts/${postId}/art`, {
        selectedPhotoId: photo.id,
        artTemplateId: template.id,
        photoTransform: computeTransform(),
        artText,
      });
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[auto,1fr]">
      <div>
        <canvas ref={canvasEl} className="rounded-lg border border-gray-200" />
        <p className="mt-2 text-xs text-gray-500">
          Arraste a foto e use os cantos para dar zoom. O overlay do template
          fica travado por cima.
        </p>
      </div>

      <div className="space-y-4">
        {photos.length > 1 && (
          <div>
            <label className="label">Foto</label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhotoId(p.id)}
                  className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${
                    p.id === photoId ? "border-brand-500" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.storageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {templates.length > 1 && (
          <div>
            <label className="label">Template</label>
            <select
              className="input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Texto da arte</label>
          <textarea
            className="input"
            rows={2}
            value={artText}
            onChange={(e) => setArtText(e.target.value)}
            placeholder="Texto curto que aparece sobre a imagem"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button onClick={save} className="btn-primary w-full" disabled={saving}>
          {saving ? "Renderizando…" : "Salvar arte e enviar para revisão"}
        </button>
      </div>
    </div>
  );
}
