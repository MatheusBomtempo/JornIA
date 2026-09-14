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
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openrouterKey: process.env.OPENROUTER_API_KEY,
    openrouterBaseUrl:
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    groqKey: process.env.GROQ_API_KEY,
    groqBaseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    // Modelo do Groq usado na corrente de fallback (AI_PROVIDER=chain).
    groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    geminiKey: process.env.GEMINI_API_KEY,
    geminiBaseUrl:
      process.env.GEMINI_BASE_URL ??
      "https://generativelanguage.googleapis.com/v1beta/openai",
    // Modelos do OpenRouter na corrente, em ordem de preferência (testados e
    // confirmados a seguir o formato do prompt). Vírgula-separados no .env.
    openrouterModels: (
      process.env.OPENROUTER_MODELS ??
      "nex-agi/nex-n2.5-mini:free,nex-agi/nex-n2.5-pro:free,inclusionai/ling-3.0-flash-vl:free"
    )
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    // NVIDIA NIM — infraestrutura pronta, mas fora da corrente por padrão:
    // testamos 9 modelos do catálogo com esta chave e nenhum se mostrou
    // viável (a maioria dá 404 "not enabled for this account"; os que
    // respondem são modelos de raciocínio lentos que não terminam a resposta
    // dentro de um tempo razoável). Habilite mais modelos no painel da NVIDIA
    // e ajuste NVIDIA_MODEL para reativar.
    nvidiaKey: process.env.NVIDIA_API_KEY,
    nvidiaBaseUrl:
      process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    nvidiaModel: process.env.NVIDIA_MODEL,
    // OpenRouter usa estes cabeçalhos (opcionais) para atribuição.
    appUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
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
