import {z} from "zod";
import {guardRequest} from "@/lib/auth/request";
import {boundedBody} from "@/lib/http/bounded-body";
import {workspaceId} from "@/lib/workspace/contracts";
import {quizConfigSchema} from "@/lib/quiz/schema";
import {timelineModeSchema} from "@/lib/activities/timeline-schema";
import {privateHeaders,workspaceService,workspaceResponseError} from "@/lib/workspace/http.server";
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("simulation"),expectedRevision:z.number().int().min(0),generationId:workspaceId,manual:z.boolean().default(false)}).strict(),
 z.object({action:z.literal("saveSimulation"),expectedRevision:z.number().int().min(0),activity:z.unknown()}).strict(),
 z.object({action:z.literal("timeline"),expectedRevision:z.number().int().min(0),generationId:workspaceId,mode:timelineModeSchema,count:z.number().int().min(2).max(20),manual:z.boolean().default(false)}).strict(),
 z.object({action:z.literal("saveTimeline"),expectedRevision:z.number().int().min(0),activity:z.unknown()}).strict(),
 z.object({action:z.literal("rewriteTimeline"),expectedRevision:z.number().int().min(1),eventId:z.string().min(1).max(80),operationId:workspaceId}).strict(),
 z.object({action:z.literal("roulette"),expectedRevision:z.number().int().min(1),generationId:workspaceId}).strict(),
 z.object({action:z.literal("saveRoulette"),expectedRevision:z.number().int().min(0),quiz:z.unknown(),activity:z.unknown()}).strict(),
 z.object({action:z.literal("save"),expectedRevision:z.number().int().min(0),quiz:z.unknown(),origin:z.enum(["ai","manual"]),operationId:workspaceId.optional()}).strict(),
 z.object({action:z.literal("generate"),expectedRevision:z.number().int().min(0),operationId:workspaceId,config:quizConfigSchema,force:z.boolean().default(false)}).strict(),
 z.object({action:z.literal("regenerate"),expectedRevision:z.number().int().min(1),operationId:workspaceId,questionId:z.string().min(1).max(80)}).strict(),
 z.object({action:z.literal("package"),expectedRevision:z.number().int().min(1),operationId:workspaceId}).strict(),
 z.object({action:z.literal("release"),operationId:workspaceId}).strict(),
]);
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){const denied=await guardRequest(request);if(denied)return denied;
 try{return Response.json({snapshot:await(await workspaceService()).snapshot((await context.params).id)},{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}
}
export async function POST(request:Request,context:Context){const denied=await guardRequest(request);if(denied)return denied;
 try{
  const id=workspaceId.parse((await context.params).id),input=command.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request,1_500_000)))),service=await workspaceService(request.signal);
  if(input.action==="simulation")return Response.json({snapshot:await service.createSimulation(id,input.generationId,input.expectedRevision,input.manual)},{headers:privateHeaders});
  if(input.action==="saveSimulation")return Response.json(await service.saveSimulation(id,input.expectedRevision,input.activity),{headers:privateHeaders});
  if(input.action==="timeline")return Response.json({snapshot:await service.createTimeline(id,input.generationId,input.expectedRevision,input.mode,input.count,input.manual)},{headers:privateHeaders});
  if(input.action==="saveTimeline")return Response.json(await service.saveTimeline(id,input.expectedRevision,input.activity),{headers:privateHeaders});
  if(input.action==="rewriteTimeline")return Response.json({snapshot:await service.rewriteTimeline(id,input.operationId,input.expectedRevision,input.eventId)},{headers:privateHeaders});
  if(input.action==="roulette")return Response.json({snapshot:await service.createRoulette(id,input.generationId,input.expectedRevision)},{headers:privateHeaders});
  if(input.action==="saveRoulette")return Response.json(await service.saveRoulette(id,input.expectedRevision,input.quiz,input.activity),{headers:privateHeaders});
  if(input.action==="save")return Response.json(await service.save(id,input.expectedRevision,input.quiz,input.origin,input.operationId),{headers:privateHeaders});
  if(input.action==="generate")return Response.json({snapshot:await service.generate(id,input.operationId,input.expectedRevision,input.config,input.force)},{headers:privateHeaders});
  if(input.action==="regenerate")return Response.json({snapshot:await service.regenerate(id,input.operationId,input.expectedRevision,input.questionId)},{headers:privateHeaders});
  if(input.action==="package")return Response.json({package:await service.buildPackage(id,input.operationId,input.expectedRevision)},{headers:privateHeaders});
  await service.release(id,input.operationId);return Response.json({released:true},{headers:privateHeaders});
 }catch(error){return workspaceResponseError(error);}
}
export async function DELETE(request:Request,context:Context){const denied=await guardRequest(request);if(denied)return denied;
 try{await(await workspaceService()).remove((await context.params).id);return Response.json({deleted:true},{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}
}
