import {z} from "zod";
import {studioQuizSchema,type StudioQuiz} from "../content/schema";
import type {RouletteProgress} from "./roulette-engine";
import {timelineSpecSchema} from "./timeline-schema";
import type {TimelineProgress} from "./timeline-engine";
import {simulationSpecSchema} from "./simulation-schema";
import type {SimulationProgress} from "./simulation-engine";

export const activityTypeSchema=z.enum(["QUIZ","ROULETTE","TIMELINE","SIMULATION"]);
export type ActivityType=z.infer<typeof activityTypeSchema>;
export const rouletteSettingsSchema=z.object({
 timeLimitSeconds:z.number().int().min(0).max(900),attempts:z.number().int().min(1).max(3),
 pointsPerCorrect:z.number().int().min(1).max(100),repeatSegments:z.boolean(),
 completion:z.enum(["all","draws"]),drawCount:z.number().int().min(3).max(40),
}).strict();
export const rouletteSpecSchema=z.object({id:z.uuid(),type:z.literal("ROULETTE"),schemaVersion:z.literal(1),
 instructions:z.string().trim().min(10).max(1200),settings:rouletteSettingsSchema,
 segments:z.array(z.object({id:z.string().min(1).max(80),label:z.string().trim().min(1).max(40),questionId:z.string().min(1).max(80)}).strict()).min(3).max(20),
 sourceGenerationId:z.uuid(),sourceRevision:z.number().int().positive(),
}).strict().superRefine((a,ctx)=>{
 for(const key of ["id","questionId"] as const)if(new Set(a.segments.map(s=>s[key])).size!==a.segments.length)ctx.addIssue({code:"custom",path:["segments"],message:"Cada segmento debe tener un reto diferente."});
 if(a.settings.completion==="draws"&&a.settings.drawCount<a.segments.length)ctx.addIssue({code:"custom",path:["settings","drawCount"],message:"El recorrido debe incluir al menos tantos giros como segmentos."});
 if(a.settings.repeatSegments&&a.settings.completion!=="draws")ctx.addIssue({code:"custom",path:["settings"],message:"Para repetir retos de práctica, define un número de giros."});
 if(!a.settings.repeatSegments&&a.settings.completion==="draws"&&a.settings.drawCount!==a.segments.length)ctx.addIssue({code:"custom",path:["settings","drawCount"],message:"Sin repetición, el número de giros debe coincidir con los segmentos."});
});
export type RouletteSpec=z.infer<typeof rouletteSpecSchema>;
const common={id:z.uuid(),schemaVersion:z.literal(1),title:z.string().trim().min(3).max(100),instructions:z.string().min(10).max(1200),content:studioQuizSchema,
 sourceFragmentIds:z.array(z.string()).min(1),evaluationRules:z.object({scored:z.boolean(),passingScore:z.number().min(0).max(100)}).strict()};
/** Reserved types are named, but cannot be parsed or exported until they have an adapter. */
export const educationalActivitySchema=z.discriminatedUnion("type",[
 z.object({...common,type:z.literal("QUIZ"),configuration:z.object({questionCount:z.number().int().min(3).max(20)})}),
 z.object({...common,type:z.literal("ROULETTE"),configuration:rouletteSpecSchema}),
 timelineSpecSchema,
 simulationSpecSchema,
]);
export type EducationalActivity=z.infer<typeof educationalActivitySchema>;
/** Learner progress belongs to the LMS, never to the teacher's shared draft/revision. */
export type ActivityProgress={type:"QUIZ";state:{v:2;fingerprint:string;a:(number|null)[];c:boolean[];i:number;started:boolean;done:boolean}}|{type:"ROULETTE";state:RouletteProgress}|{type:"TIMELINE";state:TimelineProgress}|{type:"SIMULATION";state:SimulationProgress};
export function activityDefinition(quiz:StudioQuiz,id:string,spec:RouletteSpec|null):EducationalActivity{
 const common={id,schemaVersion:1,title:quiz.title,instructions:spec?.instructions??"Responde cada pregunta y contrasta las explicaciones con el material.",content:quiz,sourceFragmentIds:[...new Set(quiz.questions.flatMap(q=>q.sourceFragmentIds))],evaluationRules:{scored:quiz.scored,passingScore:quiz.passingScore}};
 return educationalActivitySchema.parse(spec?{...common,type:"ROULETTE",configuration:spec}:{...common,type:"QUIZ",configuration:{questionCount:quiz.questions.length}});
}
export function rouletteFromQuiz(quiz:StudioQuiz,id:string,sourceGenerationId:string,sourceRevision:number):RouletteSpec{
 return rouletteSpecSchema.parse({id,type:"ROULETTE",schemaVersion:1,instructions:"Gira la ruleta, resuelve cada reto y contrasta la explicación con tu material.",sourceGenerationId,sourceRevision,
  settings:{timeLimitSeconds:0,attempts:1,pointsPerCorrect:10,repeatSegments:false,completion:"all",drawCount:quiz.questions.length},
  segments:quiz.questions.map((q,i)=>({id:`segment-${i+1}`,label:(quiz.analysis.keyConcepts.find(c=>c.id===q.concept)?.text??`Reto ${i+1}`).slice(0,40),questionId:q.id}))});
}
