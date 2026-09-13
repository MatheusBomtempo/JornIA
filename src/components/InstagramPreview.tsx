interface Props {
  artUrl?: string | null;
  caption?: string | null;
  handle?: string;
}

/** Mockup de post do feed do Instagram para a tela de revisão. */
export function InstagramPreview({
  artUrl,
  caption,
  handle = "seu_jornal",
}: Props) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-400 via-red-500 to-purple-600" />
        <div className="text-sm font-semibold">{handle}</div>
        <div className="ml-auto text-gray-400">···</div>
      </div>

      <div className="aspect-square bg-gray-100">
        {artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artUrl} alt="Arte do post" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            arte ainda não renderizada
          </div>
        )}
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <div className="flex gap-4 text-xl">
          <span>♡</span>
          <span>💬</span>
          <span>↪</span>
        </div>
        {caption && (
          <p className="whitespace-pre-wrap text-sm">
            <span className="font-semibold">{handle}</span> {caption}
          </p>
        )}
      </div>
    </div>
  );
}
