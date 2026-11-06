import {z} from "zod";
import {draftSuitabilitySchema} from "./draft-suitability";

export const timelineModeSchema=z.enum(["CHRONOLOGICAL_TIMELINE","PROCESS_TIMELINE","CONCEPTUAL_TIMELINE"]);
export const timelineDateSchema=z.object({label:z.string().trim().min(4).max(80),start:z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/),end:z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/).nullable()}).strict();
export const timelineEventSchema=z.object({id:z.string().min(1).max(80),title:z.string().trim().min(1).max(100),description:z.string().trim().min(1).max(1200),position:z.number().int().min(0).max(19),date:timelineDateSchema.nullable(),sourceFragmentIds:z.array(z.string().regex(/^p\d+-f\d+$/)).max(4),provenance:z.enum(["source","teacher","assisted"]),ordinal:z.number().int().positive().max(100).nullable()}).strict();
export const timelineSpecSchema=z.object({id:z.uuid(),type:z.literal("TIMELINE"),schemaVersion:z.literal(1),documentId:z.string().regex(/^[a-f0-9]{64}$/),title:z.string().trim().min(3).max(100),description:z.string().trim().max(1200),instructions:z.string().trim().min(10).max(1200),mode:timelineModeSchema,events:z.array(timelineEventSchema).min(2).max(20),preparation:draftSuitabilitySchema.optional(),
 configuration:z.object({presentation:z.enum(["auto","horizontal","vertical"]),showEventDetails:z.boolean(),allowBackNavigation:z.boolean(),requireAllEventsVisited:z.boolean(),enableFeedback:z.boolean(),allowRetry:z.boolean(),maxAttempts:z.number().int().min(1).max(3)}).strict(),
 assessment:z.object({mode:z.enum(["EXPLORATORY","ORDERING","IDENTIFICATION"]),passingScore:z.number().int().min(1).max(100),orderBasis:z.enum(["source","teacher","none"]),teacherOrderConfirmed:z.boolean()}).strict()
}).strict();
/** Incomplete text may be autosaved; the quality validator, not autosave, controls export. */
export const editableTimelineSchema=timelineSpecSchema.extend({title:z.string().max(100),instructions:z.string().max(1200),events:z.array(timelineEventSchema.extend({title:z.string().max(100),description:z.string().max(1200),date:z.object({label:z.string().max(80),start:z.string().max(10),end:z.string().max(10).nullable()}).strict().nullable()})).max(20)});
export type TimelineSpec=z.infer<typeof timelineSpecSchema>;
export type TimelineEvent=z.infer<typeof timelineEventSchema>;
export type TimelineMode=z.infer<typeof timelineModeSchema>;
export type TimelineIssue={severity:"INFO"|"WARNING"|"BLOCKING";code:string;message:string;eventId?:string};
export type TimelineConstraint={before:number;after:number};
export function dateBounds(value:string,end=false):number|null{
 const m=/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);if(!m)return null;
 const year=Number(m[1]),month=m[2]?Number(m[2]):end?12:1,day=m[3]?Number(m[3]):end?new Date(Date.UTC(year,month,0)).getUTCDate():1;
 if(year<1000||year>2999||month<1||month>12||day<1||day>31)return null;
 const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?d.getTime():null;
}
