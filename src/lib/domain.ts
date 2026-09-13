/**
 * Fonte única de verdade do domínio do JornIA: papéis, estados do post,
 * origens de versão e decisões de revisão. Espelha a state machine do SPEC.md.
 */

export const USER_ROLES = ["admin", "manager", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

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

export const SOURCE_TYPES = ["photo", "text", "link"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

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
