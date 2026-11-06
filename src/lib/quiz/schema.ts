import { z } from "zod";

export const extractedDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(100),
  text: z.string().min(100).max(200_000),
  pageTexts: z.array(z.object({ page: z.number().int().min(1).max(100), text: z.string().max(200_000) })).max(100).optional(),
  warnings: z.array(z.string().max(300)).max(100),
});
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export const quizConfigSchema = z.object({
  coverageMode:z.enum(["breadth","depth"]).default("breadth"),
  title: z.string().trim().min(3, "Escribe un título de al menos 3 caracteres.").max(100),
  count: z.number().int().min(3).max(20),
  scored: z.boolean(),
});
export const questionSchema = z.object({
  id: z.string().regex(/^q\d+$/),
  prompt: z.string().trim().min(10).max(1000),
  options: z.array(z.string().trim().min(1).max(100)).length(4),
  answer: z.number().int().min(0).max(3),
  evidence: z.string().trim().min(10).max(1000),
}).refine(q => new Set(q.options.map(o => o.toLocaleLowerCase())).size === 4, "Las opciones deben ser distintas.");
export const quizSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(3).max(100),
  sourceName: z.string().min(1).max(255),
  generator: z.literal("local-cloze-v1"),
  scored: z.boolean(),
  passingScore: z.literal(70),
  questions: z.array(questionSchema).min(3).max(20),
}).refine(q => new Set(q.questions.map(i => i.id)).size === q.questions.length, "IDs duplicados.");
export type Quiz = z.infer<typeof quizSchema>;
