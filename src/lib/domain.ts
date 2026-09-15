/**
 * Fonte única de verdade do domínio do JornIA: papéis, estados do post,
 * origens de versão e decisões de revisão. Espelha a state machine do SPEC.md.
 */

export const USER_ROLES = ["admin", "manager", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Publicação de post criado por staff (jornalista): admin/manager publicam
 * com 1 aprovação (própria autoridade); staff sozinho não pode aprovar a
 * própria pauta, então precisa desse tanto de colegas (jornalistas) pra
 * garantir revisão por pares antes de ir pro ar.
 */
export const PEER_APPROVALS_NEEDED = 2;

/** Estados do post (coluna posts.status). */
export const POST_STATUS = {
  PROCESSING_AI: "processing_ai",
  EDITING_ART: "editing_art",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  REJECTED: "rejected",
  FAILED: "failed",
} as const;
export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

export const SOURCE_TYPES = ["photo", "text", "link", "document"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Créditos/marcações do post (@perfil). O emoji vai na legenda antes do @,
 * no padrão da redação: "📸 @fotografo".
 */
export const CREDIT_TYPES = [
  { id: "photo", emoji: "📸", label: "Fotografia feita por" },
  { id: "source", emoji: "🗣️", label: "Fonte da notícia" },
  { id: "video", emoji: "🎥", label: "Vídeo feito por" },
  { id: "report", emoji: "✍️", label: "Apuração / reportagem de" },
  { id: "partner", emoji: "🤝", label: "Parceria / colaboração" },
  { id: "mention", emoji: "@", label: "Apenas marcar o perfil" },
] as const;

export type CreditTypeId = (typeof CREDIT_TYPES)[number]["id"];

export interface Credit {
  type: CreditTypeId;
  handle: string;
}

export function creditEmoji(type: CreditTypeId): string {
  return CREDIT_TYPES.find((c) => c.id === type)?.emoji ?? "@";
}

export function creditLabel(type: CreditTypeId): string {
  return CREDIT_TYPES.find((c) => c.id === type)?.label ?? type;
}

/** Normaliza o @ digitado pelo usuário (aceita com ou sem arroba). */
export function normalizeHandle(raw: string): string {
  const clean = raw.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return clean ? `@${clean}` : "";
}

/** Linha de créditos como vai na legenda: "📸 @fulano". */
export function formatCredit(c: Credit): string {
  const handle = normalizeHandle(c.handle);
  if (!handle) return "";
  return c.type === "mention" ? handle : `${creditEmoji(c.type)} ${handle}`;
}

/**
 * Ordena templates para exibição/seleção padrão: formatos mais "retrato"
 * primeiro (4:5 antes de 1:1) — é o padrão da redação e por isso o que
 * aparece pré-selecionado no editor de arte. Baseado na proporção real
 * (altura/largura), não na ordem de criação, então continua correto mesmo
 * se um template for recriado ou a ordem de cadastro mudar.
 */
export function sortTemplatesByFormat<
  T extends { canvasWidth: number; canvasHeight: number; createdAt: Date | string },
>(templates: T[]): T[] {
  return [...templates].sort((a, b) => {
    const ratioA = a.canvasHeight / a.canvasWidth;
    const ratioB = b.canvasHeight / b.canvasWidth;
    if (ratioA !== ratioB) return ratioB - ratioA; // mais alto (retrato) primeiro
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export const VERSION_ORIGINS = [
  "ai_generated",
  "manual_edit",
  "ai_regenerated",
] as const;
export type VersionOrigin = (typeof VERSION_ORIGINS)[number];

export const REVIEW_DECISIONS = [
  "approved",
  "rejected",
  "regenerate",
  "manual_edit",
] as const;
export type ReviewDecisionKind = (typeof REVIEW_DECISIONS)[number];

export const PUBLICATION_STATUS = {
  PENDING: "pending",
  CONTAINER_CREATED: "container_created",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;
export type PublicationStatus =
  (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

/**
 * Transições de status permitidas. Base para validar mudanças de estado
 * e para eventuais checagens de UI.
 */
export const ALLOWED_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  processing_ai: ["editing_art", "failed"],
  editing_art: ["in_review", "editing_art"],
  in_review: ["approved", "rejected", "processing_ai", "editing_art"],
  approved: ["publishing"],
  publishing: ["published", "failed"],
  published: [],
  rejected: [],
  failed: ["processing_ai", "editing_art"],
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Rótulos em pt-BR para exibição na UI. */
export const STATUS_LABELS: Record<PostStatus, string> = {
  processing_ai: "Processando IA",
  editing_art: "Edição de arte",
  in_review: "Em revisão",
  approved: "Aprovado",
  publishing: "Publicando",
  published: "Publicado",
  rejected: "Recusado",
  failed: "Falhou",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  manager: "Editor/Gerente",
  staff: "Jornalista",
};
