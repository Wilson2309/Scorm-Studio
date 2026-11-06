import {z} from "zod";
import {normalizedDocumentSchema,analysisSchema,blueprintSchema,cognitiveLevelSchema,fragmentIdsSchema,questionFamilySchema} from "./schema";
export {questionFamilySchema} from "./schema";
export const candidateSchema=z.object({id:z.string().min(1).max(80),name:z.string().min(3).max(600),type:z.enum(["definition","method","process","technique","structure","relationship","outcome","characteristic","comparison","concept"]),importanceScore:z.number().finite(),sourceFragmentIds:fragmentIdsSchema,section:z.string().max(240),pages:z.array(z.number().int().min(1).max(100)).min(1).max(4)}).strict();
export const rankedFragmentSchema=z.object({fragmentId:fragmentIdsSchema.element,score:z.number().finite(),signals:z.record(z.string(),z.number().finite())}).strict();
export const relationSchema=z.object({id:z.string(),subject:z.string().max(160),predicate:z.enum(["improves","reduces","enables","causes","depends_on","consists_of","differs_from","used_for"]),object:z.string().max(240),text:z.string().max(600),sourceFragmentIds:fragmentIdsSchema}).strict();
export const hybridPreparedSchema=z.object({method:z.literal("deterministic"),document:normalizedDocumentSchema,analysis:analysisSchema,candidates:z.array(candidateSchema).min(1).max(240),ranking:z.array(rankedFragmentSchema).max(5000),relations:z.array(relationSchema).max(200),preprocessingMs:z.number().min(0)});
export const hybridPlanSchema=z.object({blueprint:blueprintSchema,selectedConceptIds:z.array(z.string()).min(3).max(20)});
export type HybridPrepared=z.infer<typeof hybridPreparedSchema>;
export type HybridCandidate=z.infer<typeof candidateSchema>;
export type HybridRelation=z.infer<typeof relationSchema>;
export type HybridPlan=z.infer<typeof hybridPlanSchema>;
export type QuestionFamily=z.infer<typeof questionFamilySchema>;
// Only content and compliance echoes cross the wire. Difficulty/goals/document ownership remain local.
export const hybridQuestionSchema=z.object({slotId:z.string().min(1).max(80),concept:z.string().min(1).max(80),cognitiveLevel:cognitiveLevelSchema,questionFamily:questionFamilySchema,stem:z.string().min(15).max(1200),options:z.array(z.object({id:z.enum(["a","b","c","d"]),text:z.string().min(1).max(500)}).strict()).length(4),correctOptionId:z.enum(["a","b","c","d"]),explanation:z.string().min(20).max(1500),sourceFragmentIds:fragmentIdsSchema}).strict();
