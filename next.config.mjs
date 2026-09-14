import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Evita que o Next infira a raiz errada quando há outro lockfile acima.
  outputFileTracingRoot: __dirname,
  // Sharp faz o render final da arte; unpdf (pdf.js) extrai texto de PDF.
  // Ambos rodam só no servidor e não devem ser empacotados.
  serverExternalPackages: ["sharp", "unpdf", "opentype.js"],
  images: {
    // Permite exibir fotos/arte hospedadas no storage configurado.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
