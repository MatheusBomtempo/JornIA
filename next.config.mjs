import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Evita que o Next infira a raiz errada quando há outro lockfile acima.
  outputFileTracingRoot: __dirname,
  // Sharp é usado no server para o render final da arte.
  serverExternalPackages: ["sharp"],
  images: {
    // Permite exibir fotos/arte hospedadas no storage configurado.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
