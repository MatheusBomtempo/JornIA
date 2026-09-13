import { z } from "zod";
import { SOURCE_TYPES, USER_ROLES } from "./domain";
import { photoSlotSchema, textSlotSchema, photoTransformSchema } from "./render/slots";

// ── Auth ─────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Posts ────────────────────────────────────────────────────
export const createPostSchema = z
  .object({
    sourceType: z.enum(SOURCE_TYPES),
    sourceText: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    region: z.string().optional(),
    // URLs das fotos já enviadas ao storage (upload separado).
    photos: z
      .array(z.object({ storageUrl: z.string().url(), orderIndex: z.number().optional() }))
      .optional()
      .default([]),
  })
  .refine(
    (d) => d.sourceType !== "text" || !!d.sourceText?.trim(),
    { message: "sourceText é obrigatório quando sourceType = 'text'", path: ["sourceText"] },
  )
  .refine(
    (d) => d.sourceType !== "link" || !!d.sourceUrl,
    { message: "sourceUrl é obrigatório quando sourceType = 'link'", path: ["sourceUrl"] },
  )
  .refine(
    (d) => d.sourceType !== "photo" || (d.photos && d.photos.length > 0),
    { message: "ao menos uma foto é obrigatória quando sourceType = 'photo'", path: ["photos"] },
  );

export const saveArtSchema = z.object({
  selectedPhotoId: z.string().uuid(),
  artTemplateId: z.string().uuid(),
  photoTransform: photoTransformSchema,
  artText: z.string().default(""),
});

export const regenerateSchema = z.object({
  guidance: z.string().optional(),
});

export const editVersionSchema = z
  .object({
    title: z.string().optional(),
    shortNews: z.string().optional(),
    instagramCaption: z.string().optional(),
    artText: z.string().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Informe ao menos um campo para editar.",
  });

export const rejectSchema = z.object({
  reason: z.string().min(3, "Informe o motivo da recusa."),
});

// ── Style reference ──────────────────────────────────────────
export const styleReferenceSchema = z.object({
  exampleTitle: z.string().optional(),
  exampleShortNews: z.string().optional(),
  exampleCaption: z.string().optional(),
  exampleArtText: z.string().optional(),
});

// ── Templates ────────────────────────────────────────────────
export const artTemplateSchema = z.object({
  name: z.string().min(1),
  canvasWidth: z.number().int().positive().default(1080),
  canvasHeight: z.number().int().positive().default(1080),
  overlayAssetUrl: z.string().url(),
  photoSlot: photoSlotSchema,
  textSlot: textSlotSchema,
  isActive: z.boolean().optional(),
});

// ── Users ────────────────────────────────────────────────────
export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
  role: z.enum(USER_ROLES).default("staff"),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(USER_ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// ── API keys ─────────────────────────────────────────────────
export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional().default([]),
});
