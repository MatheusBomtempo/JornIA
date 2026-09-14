import { z } from "zod";
import { applyTextCase, type TextTransform } from "../text-case";

/** Limites de caracteres definidos pela redação. */
export const TITLE_MAX = 69;
export const SUBTITLE_MAX = 149;

/** Geometria do slot da foto dentro do template. */
export const photoSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type PhotoSlot = z.infer<typeof photoSlotSchema>;

/**
 * Slot de texto (título ou subtítulo). A fonte é sempre Poppins — o render
 * do servidor converte o texto em vetor com o arquivo da fonte embarcado,
 * então o resultado é idêntico em qualquer máquina.
 */
export const textSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive().default(38.2),
  /** Peso da Poppins disponível no render: 400, 600 ou 700. */
  weight: z.union([z.literal(400), z.literal(600), z.literal(700)]).default(600),
  color: z.string().default("#ffffff"),
  align: z.enum(["left", "center", "right"]).default("left"),
  lineHeight: z.number().positive().default(1.25),
  /** "none" mantém o texto como a IA escreveu (padrão dos exemplos do jornal). */
  transform: z.enum(["none", "sentence", "capitalize", "uppercase"]).default("none"),
});
export type TextSlot = z.infer<typeof textSlotSchema>;

/** Transformação da foto vinda do editor Fabric.js. */
export const photoTransformSchema = z.object({
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  scale: z.number().positive().default(1),
});
export type PhotoTransform = z.infer<typeof photoTransformSchema>;

/**
 * Deslocamento do título/subtítulo em relação à posição padrão do template
 * (que continua intacto — o ajuste vale só para esta versão do post).
 */
export const textOffsetSchema = z.object({
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
});
export type TextOffset = z.infer<typeof textOffsetSchema>;

/** Aplica a transformação de caixa escolhida no template. */
export function applyTransform(
  text: string,
  transform: TextSlot["transform"],
): string {
  return applyTextCase(text, transform as TextTransform);
}
