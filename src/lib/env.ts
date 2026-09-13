/**
 * Acesso centralizado e tipado às variáveis de ambiente.
 * Mantém defaults sensatos para o modo de desenvolvimento.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Veja .env.example.`,
    );
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",

  databaseUrl: () => required("DATABASE_URL", process.env.DATABASE_URL),

  authSecret: () =>
    required(
      "AUTH_SECRET",
      process.env.AUTH_SECRET ??
        (process.env.NODE_ENV !== "production"
          ? "dev-secret-inseguro-troque-em-producao"
          : undefined),
    ),
  authSessionTtl: () => Number(process.env.AUTH_SESSION_TTL ?? 604800),

  ai: {
    provider: (process.env.AI_PROVIDER ?? "anthropic").toLowerCase(),
    model: process.env.AI_MODEL ?? "claude-sonnet-5",
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
  },

  storage: {
    provider: (process.env.STORAGE_PROVIDER ?? "local").toLowerCase(),
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "auto",
      bucket: process.env.S3_BUCKET,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      publicUrl: process.env.S3_PUBLIC_URL,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    },
  },

  instagram: {
    userId: process.env.IG_USER_ID,
    accessToken: process.env.IG_ACCESS_TOKEN,
    graphVersion: process.env.IG_GRAPH_VERSION ?? "v21.0",
  },
};
