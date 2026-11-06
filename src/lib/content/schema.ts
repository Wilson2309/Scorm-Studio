import { z } from "zod";

export const sourceFragmentSchema = z.object({
  id: z.string().regex(/^p\d+-f\d+$/), page: z.number().int().min(1).max(100),
  section: z.string().max(240), text: z.string().min(1).max(2400), original: z.string().min(1).max(4000),
  documentId:z.string().regex(/^[a-f0-9]{64}$/),normalizedText:z.string().min(1).max(2400),sectionHeading:z.string().max(240),
  contentType:z.enum(["academic","administrative","furniture","duplicate","decorative","fragment"]),
}).strict();
export const sourceReferenceSchema = z.object({
  fragmentId: z.string().regex(/^p\d+-f\d+$/), page: z.number().int().min(1).max(100), quote: z.string().min(1).max(1200),
}).strict();
export const fragmentIdsSchema=z.array(z.string().regex(/^p\d+-f\d{3,}$/)).min(1).max(4);
const groundedItem = z.object({ id: z.string().min(1).max(80), text: z.string().min(3).max(600),sourceFragmentIds:fragmentIdsSchema, sourceReferences: z.array(sourceReferenceSchema).min(1).max(4) }).strict();
export const analysisSchema = z.object({
  documentId:z.string().regex(/^[a-f0-9]{64}$/),sourceFragmentIds:z.array(fragmentIdsSchema.element).min(1).max(40),
  title: z.string().min(3).max(160), subject: z.string().min(3).max(160), unit: z.string().max(160),
  summary: z.string().min(20).max(1800),
  learningObjectives: z.array(groundedItem).min(1).max(24), keyConcepts: z.array(groundedItem).min(1).max(32),
  sections: z.array(groundedItem).min(1).max(30), importantFacts: z.array(groundedItem).min(1).max(30),
  relationships: z.array(groundedItem).max(24),
  excludedAdministrativeContent: z.array(z.object({ fragmentId: z.string(), reason: z.string().min(5).max(240) }).strict()).max(100),
  sourceReferences: z.array(sourceReferenceSchema).min(1).max(40),
}).strict();
export const normalizedDocumentSchema = z.object({
  documentId:z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(255), pages: z.number().int().min(1).max(100),
  fragments: z.array(sourceFragmentSchema).min(1).max(2000),
  excluded: z.array(sourceFragmentSchema.extend({ reason: z.string() })).max(3000),
});
export const cognitiveLevelSchema = z.enum(["remember", "comprehension", "application", "analysis"]);
export const difficultySchema = z.enum(["initial", "intermediate", "advanced"]);
export const questionFamilySchema=z.enum(["definition","distinction","relationship","comparison","process","cause_effect","short_scenario","application"]);
export const blueprintSlotSchema=z.object({
  slot:z.number().int().min(1).max(20),questionId:z.string().min(1).max(80),
  conceptId:z.string(),objectiveId:z.string(),targetConcept:z.string().min(1).max(600),targetLearningObjective:z.string().min(1).max(600),
  difficulty:difficultySchema,cognitiveLevel:cognitiveLevelSchema,
  allowedSourceFragmentIds:z.array(fragmentIdsSchema.element).min(1).max(12),
  perspective:z.enum(["interpret","use","diagnose","compare"]),
  slotId:z.string().max(80).optional(),questionFamily:questionFamilySchema.optional(),relatedConceptIds:z.array(z.string()).max(8).optional(),distractorCandidateIds:z.array(z.string()).max(4).optional(),
}).strict();
export const blueprintSchema = z.object({
  coverageMode:z.enum(["breadth","depth"]).default("breadth"),
  questionCount: z.number().int().min(3).max(20),
  conceptsCovered: z.array(z.string()).min(1).max(32), learningObjectivesCovered: z.array(z.string()).min(1).max(24),
  difficultyDistribution: z.object({ initial: z.number().int().min(0), intermediate: z.number().int().min(0), advanced: z.number().int().min(0) }),
  cognitiveLevels: z.array(cognitiveLevelSchema).min(1).max(4), questionTypes: z.array(z.literal("single-choice")).length(1),
  slots: z.array(blueprintSlotSchema).min(3).max(20),
});
// Leave cross-field/semantic rules to quality.ts so invalid drafts remain editable.
export const educationalQuestionSchema = z.object({
  documentId:z.string().regex(/^[a-f0-9]{64}$/),sourceFragmentIds:fragmentIdsSchema,
  id: z.string().min(1).max(80), stem: z.string().min(15).max(1200),
  options: z.array(z.object({ id: z.enum(["a","b","c","d"]), text: z.string().min(1).max(500) }).strict()).length(4),
  correctOptionId: z.enum(["a","b","c","d"]), explanation: z.string().min(20).max(1500),
  concept: z.string().min(1).max(80), learningObjective: z.string().min(1).max(80),
  difficulty: difficultySchema, cognitiveLevel: cognitiveLevelSchema,
  requestedCognitiveLevel:cognitiveLevelSchema.optional(),actualCognitiveLevel:cognitiveLevelSchema.optional(),
  slotId:z.string().max(80).optional(),questionFamily:questionFamilySchema.optional(),
  sourceReferences: z.array(sourceReferenceSchema).min(1).max(4),
}).strict();
export const questionBatchSchema = z.object({ questions: z.array(educationalQuestionSchema).min(1).max(20) }).strict();
export const studioQuizSchema = z.object({
  version: z.literal(2), generator: z.literal("content-intelligence-v1"), title: z.string().trim().min(3).max(100),
  description: z.string().min(10).max(1800), sourceName: z.string().min(1).max(255), scored: z.boolean(), passingScore: z.number().int().min(1).max(100),
  questions: z.array(educationalQuestionSchema).min(3).max(20),
  analysis: analysisSchema, blueprint: blueprintSchema, sources: z.array(sourceFragmentSchema).min(1).max(2000),
});
export type SourceFragment = z.infer<typeof sourceFragmentSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type NormalizedDocument = z.infer<typeof normalizedDocumentSchema>;
export type DocumentAnalysis = z.infer<typeof analysisSchema>;
export type QuizBlueprint = z.infer<typeof blueprintSchema>;
export type BlueprintSlot=z.infer<typeof blueprintSlotSchema>;
export type EducationalQuestion = z.infer<typeof educationalQuestionSchema>;
export type StudioQuiz = z.infer<typeof studioQuizSchema>;
