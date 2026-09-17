import { z } from "zod";
import { USER_ROLES, CREDIT_TYPES } from "./domain";
import {
  photoSlotSchema,
  textSlotSchema,
  photoTransformSchema,
  textOffsetSchema,
  TITLE_MAX,
  SUBTITLE_MAX,
} from "./render/slots";

const creditTypeIds = CREDIT_TYPES.map((c) => c.id) as [string, ...string[]];

/** Crédito/marcação: tipo + @perfil. */
export const creditSchema = z.object({
  type: z.enum(creditTypeIds),
  handle: z.string().trim().min(1, "Informe o @ do perfil."),
});

// ── Auth ─────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Usuário logado troca a própria senha (ver /api/auth/change-password). */
export const changePasswordSchema = z.object({
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

// ── Posts ────────────────────────────────────────────────────
/**
 * Captura unificada: o jornalista manda o que tem — texto OU link — mais
 * (opcionalmente) uma foto. O tipo de fonte é derivado no servidor.
 */
export const createPostSchema = z
  .object({
    text: z.string().trim().min(1).optional(),
    url: z.string().url().optional(),
    photo: z.object({ storageUrl: z.string().url() }).optional(),
    /** Documento anexado (PDF/txt) já convertido em texto pelo /api/documents. */
    document: z
      .object({
        name: z.string().min(1),
        text: z.string().trim().min(1),
        pages: z.number().int().positive().optional(),
      })
      .optional(),
    /** Créditos/marcações opcionais (@perfil + tipo). */
    credits: z.array(creditSchema).max(8).optional().default([]),
  })
  .refine((d) => !!(d.text || d.url || d.document), {
    message: "Envie o texto da notícia, um link ou um documento.",
    path: ["text"],
  });

export const saveArtSchema = z.object({
  selectedPhotoId: z.string().uuid(),
  artTemplateId: z.string().uuid(),
  photoTransform: photoTransformSchema,
  title: z.string().max(TITLE_MAX).default(""),
  subtitle: z.string().max(SUBTITLE_MAX).default(""),
  // Posição do título/subtítulo pode ser ajustada por post, sem tocar no template.
  titleOffset: textOffsetSchema.optional(),
  subtitleOffset: textOffsetSchema.optional(),
});

export const regenerateSchema = z.object({
  guidance: z.string().optional(),
});

/**
 * Anexa uma foto extra a um post já criado — cobre os casos em que o
 * jornalista só decide a foto depois de gerar o texto: achou uma imagem
 * melhor, baixou uma do Google ou de um banco gratuito a partir das
 * sugestões da IA. Nunca substitui a foto já enviada sozinha; só adiciona
 * uma opção a mais pro jornalista escolher no editor de arte.
 */
export const addPhotoSchema = z.object({
  storageUrl: z.string().url(),
});

export const editVersionSchema = z
  .object({
    title: z.string().max(TITLE_MAX).optional(),
    subtitle: z.string().max(SUBTITLE_MAX).optional(),
    instagramCaption: z.string().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Informe ao menos um campo para editar.",
  });

export const rejectSchema = z.object({
  reason: z.string().min(3, "Informe o motivo da recusa."),
});

// ── Exemplos de estilo ───────────────────────────────────────
export const styleExampleSchema = z
  .object({
    title: z.string().trim().optional(),
    subtitle: z.string().trim().optional(),
    caption: z.string().trim().optional(),
    orderIndex: z.number().int().optional(),
  })
  .refine((d) => !!(d.title || d.subtitle || d.caption), {
    message: "Preencha ao menos um campo do exemplo.",
  });

// ── Templates ────────────────────────────────────────────────
export const artTemplateSchema = z.object({
  name: z.string().min(1),
  canvasWidth: z.number().int().positive().default(1080),
  canvasHeight: z.number().int().positive().default(1080),
  overlayAssetUrl: z.string().url(),
  photoSlot: photoSlotSchema,
  titleSlot: textSlotSchema,
  subtitleSlot: textSlotSchema.optional(),
  isActive: z.boolean().optional(),
});

// ── Users ────────────────────────────────────────────────────
// Sem campo de senha: sempre gerada forte no servidor e mandada por e-mail
// (nunca digitada por quem cria) — ver /api/users POST.
export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(USER_ROLES).default("staff"),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(USER_ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// ── Configurações do app ─────────────────────────────────────
export const updateSettingsSchema = z.object({
  reviewRequired: z.boolean(),
});

// ── API keys ─────────────────────────────────────────────────
export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional().default([]),
});
