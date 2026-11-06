import {z} from "zod";
import {blueprintSchema,educationalQuestionSchema,studioQuizSchema,type StudioQuiz} from "../content/schema";
import {hybridPreparedSchema,type HybridPrepared} from "../content/hybrid-schema";
import {rouletteSpecSchema,type RouletteSpec} from "../activities/schema";
import {editableTimelineSchema,type TimelineSpec} from "../activities/timeline-schema";
import {editableSimulationSchema,type SimulationSpec} from "../activities/simulation-schema";

export const workspaceId=z.uuid();
export const workspaceStates=z.enum(["UPLOADED","PREPARED","GENERATING","NEEDS_REVIEW","READY","SCORM_GENERATED","FAILED"]);
// Drafts can be incomplete. The engine's stricter schemas/quality gate still control export.
const editableQuestion=educationalQuestionSchema.extend({stem:z.string().max(1200),explanation:z.string().max(1500),
 sourceFragmentIds:z.array(z.string().max(80)).max(4),sourceReferences:z.array(educationalQuestionSchema.shape.sourceReferences.element).max(4),
 options:z.array(z.object({id:z.enum(["a","b","c","d"]),text:z.string().max(500)})).length(4)});
const draftBlueprint=blueprintSchema.extend({questionCount:z.number().int().min(0).max(20),slots:z.array(blueprintSchema.shape.slots.element).max(20),
 conceptsCovered:z.array(z.string()).max(32),learningObjectivesCovered:z.array(z.string()).max(24),cognitiveLevels:z.array(blueprintSchema.shape.cognitiveLevels.element).max(4)});
export const editableQuizSchema=studioQuizSchema.omit({analysis:true,sources:true}).extend({questions:z.array(editableQuestion).max(20),blueprint:draftBlueprint});
export const persistedDraftSchema=z.object({version:z.literal(1),quiz:editableQuizSchema,sourceIds:z.array(z.string().max(80)).max(2000),
 validation:z.object({valid:z.boolean(),reviewState:z.enum(["READY","NEEDS_REVIEW"]),issues:z.array(z.object({severity:z.enum(["PASS","INFO","WARNING","BLOCKING"]),code:z.string().max(120),title:z.string().max(500),message:z.string().max(3000),questionId:z.string().nullable()})).max(1000)}).optional()
}).strict();
export type PersistedDraft=z.infer<typeof persistedDraftSchema>;
export function dehydrateQuiz(quiz:StudioQuiz):PersistedDraft{
 return persistedDraftSchema.parse({version:1,quiz,sourceIds:quiz.sources.map(f=>f.id)});
}
export function hydrateQuiz(input:unknown,prepared:HybridPrepared):StudioQuiz{
 const draft=persistedDraftSchema.parse(input),fragments=new Map(prepared.document.fragments.map(f=>[f.id,f]));
 const sources=draft.sourceIds.map(id=>{const f=fragments.get(id);if(!f)throw new Error("Fuente canónica no disponible.");return f;});
 // Never let a stored/browser-written quotation replace the application's canonical text.
 const questions=draft.quiz.questions.map(q=>({...q,sourceReferences:q.sourceFragmentIds.flatMap(id=>{
  const f=fragments.get(id);return f?[{fragmentId:id,page:f.page,quote:f.text.slice(0,1200)}]:[];
 })}));
 return {...draft.quiz,questions,analysis:prepared.analysis,sources};
}
export const persistedRouletteDraftSchema=persistedDraftSchema.extend({version:z.literal(2),activity:rouletteSpecSchema});
export const persistedTimelineDraftSchema=z.object({version:z.literal(3),activity:editableTimelineSchema}).strict();
export const persistedSimulationDraftSchema=z.object({version:z.literal(4),activity:editableSimulationSchema}).strict();
export function readActivityDraft(input:unknown,prepared:HybridPrepared):{quiz:StudioQuiz|null;activity:RouletteSpec|null;timeline:TimelineSpec|null;simulation:SimulationSpec|null}{
 if(input&&typeof input==="object"&&"version" in input&&input.version===4){const draft=persistedSimulationDraftSchema.parse(input);if(draft.activity.documentId!==prepared.document.documentId)throw Error("El borrador pertenece a otro documento.");return {quiz:null,activity:null,timeline:null,simulation:draft.activity};}
 if(input&&typeof input==="object"&&"version" in input&&input.version===3){const draft=persistedTimelineDraftSchema.parse(input);if(draft.activity.documentId!==prepared.document.documentId)throw Error("El borrador pertenece a otro documento.");return {quiz:null,activity:null,timeline:draft.activity,simulation:null};}
 if(input&&typeof input==="object"&&"version" in input&&input.version===2){const {activity,...base}=persistedRouletteDraftSchema.parse(input);return {quiz:hydrateQuiz({...base,version:1},prepared),activity,timeline:null,simulation:null};}
 return {quiz:hydrateQuiz(input,prepared),activity:null,timeline:null,simulation:null};
}
export const documentRowSchema=z.object({id:workspaceId,user_id:workspaceId,filename:z.string(),file_size:z.number().int(),file_sha256:z.string(),storage_path:z.string(),
 status:z.enum(["UPLOADED","PREPARED","FAILED"]),page_count:z.number().nullable(),prepared_json:z.unknown(),deleting_at:z.string().nullable()});
export const generationRowSchema=z.object({id:workspaceId,user_id:workspaceId,document_id:workspaceId,title:z.string(),activity_type:z.enum(["QUIZ","ROULETTE","TIMELINE","SIMULATION"]).default("QUIZ"),status:workspaceStates,
 current_revision:z.number().int(),active_operation:workspaceId.nullable(),current_package_id:workspaceId.nullable(),deleting_at:z.string().nullable(),
 question_count:z.number().int(),created_at:z.string(),updated_at:z.string()});
export const revisionRowSchema=z.object({generation_id:workspaceId,user_id:workspaceId,revision:z.number().int(),draft_json:z.unknown(),origin:z.enum(["ai","manual"])});
export const packageRowSchema=z.object({id:workspaceId,generation_id:workspaceId,user_id:workspaceId,revision:z.number().int(),operation_id:workspaceId,
 storage_path:z.string(),status:z.enum(["UPLOADING","READY","OBSOLETE","FAILED"]),file_size:z.number().nullable(),file_sha256:z.string().nullable()});
export const operationSchema=z.object({id:workspaceId,generation_id:workspaceId,user_id:workspaceId,status:z.enum(["RUNNING","COMPLETED","FAILED"]),
 base_revision:z.number().int(),result_revision:z.number().nullable(),event_type:z.enum(["GENERATE","REGENERATE","PACKAGE"]),claimed:z.boolean()});
export const workspaceSnapshotSchema=z.object({generation:generationRowSchema,document:documentRowSchema.omit({prepared_json:true}),activity:rouletteSpecSchema.nullable().default(null),
 timeline:editableTimelineSchema.nullable().default(null),simulation:editableSimulationSchema.nullable().default(null),prepared:hybridPreparedSchema,quiz:z.unknown().nullable(),origin:z.enum(["ai","manual"]),package:packageRowSchema.nullable()});
export type WorkspaceSnapshot=z.infer<typeof workspaceSnapshotSchema> & {quiz:StudioQuiz|null};
export type WorkspaceGeneration=z.infer<typeof generationRowSchema>;
export type WorkspaceDocument=z.infer<typeof documentRowSchema>;
export type WorkspacePackage=z.infer<typeof packageRowSchema>;
export type WorkspaceMeta={activityType?:"QUIZ"|"ROULETTE"|"TIMELINE"|"SIMULATION";documentId:string;generationId:string;revision:number;origin:"ai"|"manual";package:WorkspacePackage|null;activeOperation:string|null};
export function parseWorkspaceSnapshot(input:unknown):WorkspaceSnapshot{
 const value=workspaceSnapshotSchema.parse(input);
 const quiz=value.quiz===null?null:hydrateQuiz(persistedDraftSchema.parse({version:1,quiz:value.quiz,sourceIds:value.prepared.document.fragments.map(f=>f.id)}),value.prepared);
 return {...value,quiz};
}
