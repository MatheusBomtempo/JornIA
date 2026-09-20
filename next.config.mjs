import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Evita que o Next infira a raiz errada quando há outro lockfile acima.
  outputFileTracingRoot: __dirname,
  // Sharp faz o render final da arte; unpdf (pdf.js) extrai texto de PDF;
  // fluent-ffmpeg + @ffmpeg-installer/ffmpeg renderizam o vídeo com o texto
  // animado. Todos rodam só no servidor e não devem ser empacotados.
  serverExternalPackages: [
    "sharp",
    "unpdf",
    "opentype.js",
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
  ],
  // render/text.ts lê os .woff da Poppins via fs.readFile com caminho montado
  // em runtime (não é um import/require literal) — o tracer do Next não
  // detecta esse acesso sozinho e deixava a fonte de fora do bundle da
  // função serverless (funcionava local, quebrava só na Vercel). Mesmo
  // problema com o binário do ffmpeg (resolvido em runtime pelo installer).
  //
  // "/**/*" (não só "/api/**/*"): services/posts.ts importa render/video.ts
  // no topo do arquivo, e páginas normais (ex.: /dashboard, /posts/[id])
  // importam services/posts.ts pra listar/carregar posts — então o require
  // do @ffprobe-installer/ffprobe também entra no bundle DESSAS páginas, não
  // só das rotas /api. Escopo só em /api deixava o /dashboard quebrado em
  // produção com "Cannot find module '@ffprobe-installer/linux-x64/ffprobe'".
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/@fontsource/poppins/files/**",
      "./node_modules/@ffmpeg-installer/**",
      "./node_modules/@ffprobe-installer/**",
    ],
  },
  images: {
    // Permite exibir fotos/arte hospedadas no storage configurado.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
