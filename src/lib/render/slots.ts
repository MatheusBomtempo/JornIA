import { z } from "zod";

/** Geometria do slot da foto dentro do template. */
export const photoSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type PhotoSlot = z.infer<typeof photoSlotSchema>;

/** Geometria + tipografia do slot de texto. */
export const textSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  font: z.string().default("sans-serif"),
  fontSize: z.number().positive().default(48),
  color: z.string().default("#ffffff"),
  align: z.enum(["left", "center", "right"]).default("left"),
  lineHeight: z.number().positive().default(1.2),
  weight: z.union([z.string(), z.number()]).default(700),
});
export type TextSlot = z.infer<typeof textSlotSchema>;

/** Transformação da foto vinda do editor Fabric.js. */
export const photoTransformSchema = z.object({
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  scale: z.number().positive().default(1),
});
export type PhotoTransform = z.infer<typeof photoTransformSchema>;
