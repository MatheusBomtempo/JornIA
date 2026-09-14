"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api-client";
import { applyTextCase, type TextTransform } from "@/lib/text-case";
import { Tooltip } from "./Tooltip";

/**
 * Formatos aceitos pelo feed do Instagram. 4:5 vem primeiro — é o formato
 * padrão da redação (ocupa mais tela no celular) e por isso o pré-selecionado
 * tanto aqui quanto na escolha de template do editor de arte.
 */
const FORMATS = [
  { id: "4:5", label: "Retrato 4:5", w: 1080, h: 1350, hint: "Padrão da redação — ocupa mais tela no celular" },
  { id: "1:1", label: "Quadrado 1:1", w: 1080, h: 1080, hint: "Alternativa, o mais comum no feed" },
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

const EXAMPLE_TITLE = "Tragédia em BH: acidente entre motos deixa dois mortos";
const EXAMPLE_SUB =
  "Duas pessoas morreram em acidente na José Cândido da Silveira.";

export function TemplateBuilder({ onCreated }: { onCreated?: () => void }) {
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
          Como criar a moldura no Canva / Photoshop
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
          <li>
            Crie o design no tamanho exato:{" "}
            <strong className="text-ink">1080×1080</strong> (1:1) ou{" "}
            <strong className="text-ink">1080×1350</strong> (4:5).
          </li>
          <li>
            Desenhe só a arte fixa: faixa, logo, tarja. <strong className="text-ink">
            Não coloque a foto nem o texto da notícia</strong> — eles entram aqui.
          </li>
          <li>
            Deixe <strong className="text-ink">vazia (transparente)</strong> a área onde
            a foto vai aparecer.
          </li>
          <li>
            Exporte em <strong className="text-ink">PNG com fundo transparente</strong>.
            No Canva: Compartilhar → Baixar → PNG → marque “Fundo transparente”.
          </li>
          <li>Suba o arquivo aqui e posicione os retângulos sobre ele.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          Faça um para cada formato: um template 1:1 e outro 4:5.
        </p>
      </details>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ── Palco ─────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              Monte o template
              <Tooltip
                text="Arraste os retângulos para definir onde entram a foto, o título e o subtítulo. As medidas são na resolução do Instagram — o resultado final sai idêntico."
                where="Vale para todo post criado com este template"
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
              label="FOTO" color="brand" box={photo} px={px}
              activeSlot={active === "photo"}
              onMove={(e) => startDrag(e, "move", "photo")}
              onResize={(e) => startDrag(e, "resize", "photo")}
            />

            <SlotBox
              label="TÍTULO" color="amber" box={title} px={px}
              activeSlot={active === "title"}
              onMove={(e) => startDrag(e, "move", "title")}
              onResize={(e) => startDrag(e, "resize", "title")}
            >
              <PreviewText text={EXAMPLE_TITLE} font={titleFont} px={px} />
            </SlotBox>

            <SlotBox
              label="SUBTÍTULO" color="emerald" box={subtitle} px={px}
              activeSlot={active === "subtitle"}
              onMove={(e) => startDrag(e, "move", "subtitle")}
              onResize={(e) => startDrag(e, "resize", "subtitle")}
            >
              <PreviewText text={EXAMPLE_SUB} font={subFont} px={px} />
            </SlotBox>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm"
              onClick={() => setPhoto({ x: 0, y: 0, width: format.w, height: format.h })}>
              Foto ocupa tudo
            </button>
            <button className="btn-ghost btn-sm"
              onClick={() => {
                setTitle((t) => clampBox({ ...t, x: Math.round((format.w - t.width) / 2) }));
                setSubtitle((s) => clampBox({ ...s, x: Math.round((format.w - s.width) / 2) }));
              }}>
              Centralizar textos
            </button>
          </div>
        </div>

        {/* ── Controles ─────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="tpl-name">
              Nome do template
              <Tooltip text="Só para você identificar depois, ex.: 'Padrão 1:1' ou 'Urgente 4:5'. Não aparece no post." />
            </label>
            <input id="tpl-name" className="input" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Ex.: Padrão 1:1" />
          </div>

          <div>
            <span className="label">Formato do post</span>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormat(f)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    format.id === f.id
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-line bg-elevated hover:border-brand-500/50"
                  }`}>
                  <span className="block text-sm font-semibold">{f.label}</span>
                  <span className="block text-[11px] text-muted">{f.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">
              Moldura (overlay PNG)
              <Tooltip
                text="A arte fixa da marca exportada do Canva/Photoshop. Precisa ser PNG com fundo transparente onde a foto aparece."
                where="Fica por cima da foto, em todos os posts"
              />
            </label>
            <input type="file" accept="image/png"
              onChange={(e) => e.target.files?.[0] && uploadOverlay(e.target.files[0])}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0
                         file:bg-brand-500/15 file:px-3 file:py-2 file:text-sm file:font-medium
                         file:text-brand-300" />
            {uploading && <p className="hint">Enviando…</p>}
            {overlayUrl && <p className="hint text-emerald-400">Moldura carregada ✓</p>}
          </div>

          {/* Estilo do slot de texto selecionado */}
          <fieldset className="card-soft space-y-3 p-3">
            <legend className="px-1 text-xs font-semibold text-muted">
              Estilo do texto · fonte Poppins
            </legend>

            <div className="grid grid-cols-2 gap-2">
              {(["title", "subtitle"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setActive(k)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                    active === k
                      ? "border-brand-500 bg-brand-500/10 text-brand-300"
                      : "border-line bg-elevated text-muted hover:text-ink"
                  }`}>
                  {k === "title" ? "Título" : "Subtítulo"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs" htmlFor="fs">Tamanho</label>
                <input id="fs" type="number" step="0.1" className="input"
                  value={activeFont.fontSize}
                  onChange={(e) => setActiveFont({ ...activeFont, fontSize: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label text-xs" htmlFor="fc">Cor</label>
                <input id="fc" type="color" value={activeFont.color}
                  onChange={(e) => setActiveFont({ ...activeFont, color: e.target.value })}
                  className="h-11 w-full cursor-pointer rounded-xl border border-line bg-elevated p-1" />
              </div>
            </div>

            <div>
              <label className="label text-xs" htmlFor="fw">Peso</label>
              <select id="fw" className="input" value={activeFont.weight}
                onChange={(e) => setActiveFont({ ...activeFont, weight: Number(e.target.value) as 400 | 600 | 700 })}>
                <option value={400}>Regular (400)</option>
                <option value={600}>SemiBold (600)</option>
                <option value={700}>Bold (700)</option>
              </select>
            </div>

            <div>
              <span className="label text-xs">Alinhamento</span>
              <div className="grid grid-cols-3 gap-2">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} type="button"
                    onClick={() => setActiveFont({ ...activeFont, align: a })}
                    className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                      activeFont.align === a
                        ? "border-brand-500 bg-brand-500/10 text-brand-300"
                        : "border-line bg-elevated text-muted hover:text-ink"
                    }`}>
                    {a === "left" ? "Esq." : a === "center" ? "Centro" : "Dir."}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label text-xs" htmlFor="ft">
                Caixa
                <Tooltip text="Normal mantém o texto como a IA escreveu (padrão dos exemplos do jornal). Frase deixa só a primeira letra maiúscula. Capitalizado deixa Cada Palavra Com Inicial Maiúscula." />
              </label>
              <select id="ft" className="input" value={activeFont.transform}
                onChange={(e) => setActiveFont({ ...activeFont, transform: e.target.value as FontCfg["transform"] })}>
                <option value="none">Normal (como escrito)</option>
                <option value="sentence">Frase (só a 1ª maiúscula)</option>
                <option value="capitalize">Capitalizado</option>
                <option value="uppercase">MAIÚSCULAS</option>
              </select>
            </div>
          </fieldset>

          <div className="card-soft p-3 text-xs text-muted">
            <div className="mb-1 font-semibold text-ink">Medidas</div>
            <div>Foto — x {photo.x} · y {photo.y} · {photo.width}×{photo.height}</div>
            <div>Título — x {title.x} · y {title.y} · {title.width}×{title.height}</div>
            <div>Subtítulo — x {subtitle.x} · y {subtitle.y} · {subtitle.width}×{subtitle.height}</div>
          </div>

          {error && <p className="alert-error">{error}</p>}

          <button className="btn-primary w-full" onClick={save}
            disabled={busy || !name || !overlayUrl}>
            {busy ? "Salvando…" : "Criar template"}
          </button>
          {!overlayUrl && <p className="hint text-center">Envie a moldura PNG para habilitar</p>}
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
