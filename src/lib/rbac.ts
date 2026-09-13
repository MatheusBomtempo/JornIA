import { forbidden } from "./http";
import type { UserRole } from "./domain";

type HasRole = { role: UserRole; id: string };

/** Garante que o usuário tem um dos papéis; senão lança 403. */
export function requireRole<T extends HasRole>(
  user: T,
  ...roles: UserRole[]
): T {
  if (!roles.includes(user.role)) {
    throw forbidden(
      `Ação restrita aos papéis: ${roles.map(labelRole).join(", ")}.`,
    );
  }
  return user;
}

// Permissões derivadas da tabela de papéis do SPEC.
export const can = {
  /** Cria fontes/posts: todos os papéis autenticados. */
  createPost: (_u: HasRole) => true,
  /** Aprova/recusa/refaz/publica: manager e admin. */
  review: (u: HasRole) => u.role === "manager" || u.role === "admin",
  publish: (u: HasRole) => u.role === "manager" || u.role === "admin",
  /** Edita style reference e templates: manager e admin. */
  editStyle: (u: HasRole) => u.role === "manager" || u.role === "admin",
  editTemplates: (u: HasRole) => u.role === "manager" || u.role === "admin",
  /** Gerencia usuários e API keys: só admin. */
  manageUsers: (u: HasRole) => u.role === "admin",
  manageApiKeys: (u: HasRole) => u.role === "admin",
};

/**
 * Staff (jornalista) só pode editar as próprias submissões antes da aprovação.
 * Manager/admin podem editar qualquer submissão.
 */
export function canEditPost(
  user: HasRole,
  post: { createdBy: string },
): boolean {
  if (user.role === "admin" || user.role === "manager") return true;
  return post.createdBy === user.id;
}

function labelRole(role: UserRole): string {
  return { admin: "admin", manager: "manager", staff: "staff" }[role];
}
