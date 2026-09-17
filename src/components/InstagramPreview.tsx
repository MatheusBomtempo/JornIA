"use client";

import { useLocale } from "./LocaleProvider";

interface Props {
  artUrl?: string | null;
  caption?: string | null;
  handle?: string;
  /**
   * Proporção largura/altura do template (ex.: 1080/1350 para 4:5,
   * 1080/1080 para 1:1). Sem isso, o preview assume um quadrado e corta a
   * imagem quando o post é 4:5 — sempre passe o tamanho real do template.
   */
  aspectRatio?: number;
}

/** Mockup de post do feed do Instagram para a tela de revisão. */
export function InstagramPreview({
  artUrl,
  caption,
  handle,
  aspectRatio = 1080 / 1350,
}: Props) {
  const { dict } = useLocale();
  const resolvedHandle = handle ?? dict.instagramPreview.defaultHandle;
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-elevated">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-400 via-red-500 to-purple-600" />
        <span className="text-sm font-semibold">{resolvedHandle}</span>
        <span className="ml-auto text-muted" aria-hidden>···</span>
      </div>

      {/* A proporção bate exatamente com o template, então nada é cortado. */}
      <div className="bg-black" style={{ aspectRatio }}>
        {artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artUrl}
            alt={dict.instagramPreview.artAlt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-faint">
            {dict.instagramPreview.artPlaceholder}
          </div>
        )}
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <div className="flex gap-3.5 text-[17px]" aria-hidden>
          <span>♡</span>
          <span>💬</span>
          <span>↪</span>
        </div>
        {caption && (
          <p className="whitespace-pre-wrap break-words text-sm leading-snug">
            <span className="font-semibold">{resolvedHandle}</span>{" "}
            <span className="text-ink/90">{caption}</span>
          </p>
        )}
      </div>
    </div>
  );
}
