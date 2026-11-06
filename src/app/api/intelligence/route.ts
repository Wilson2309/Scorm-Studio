import { z } from "zod";
import {guardRequest} from "@/lib/auth/request";
import { boundedBody, BodyTooLargeError } from "@/lib/http/bounded-body";
import { extractedDocumentSchema, quizConfigSchema } from "@/lib/quiz/schema";
import { analysisSchema, normalizedDocumentSchema, blueprintSchema } from "@/lib/content/schema";
import { getProvider, IntelligenceError, getProviderStatus } from "@/lib/content/provider.server";
import { analyzeContent, buildEducationalQuiz, regenerate } from "@/lib/content/pipeline.server";
import { validateQuiz } from "@/lib/content/quality";
import {analyzeDocumentDeterministically} from "@/lib/content/deterministic-analysis.server";
import {hybridPreparedSchema} from "@/lib/content/hybrid-schema";
import {generateHybridQuiz,regenerateHybridQuestion} from "@/lib/content/hybrid-pipeline.server";

const requestSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("prepare"),extracted:extractedDocumentSchema}),
  z.object({action:z.literal("generateHybrid"),prepared:hybridPreparedSchema,config:quizConfigSchema}),
  z.object({action:z.literal("regenerateHybrid"),prepared:hybridPreparedSchema,slot:blueprintSchema.shape.slots.element,existingQuestions:z.array(z.object({id:z.string().max(80),concept:z.string().max(80),conceptLabel:z.string().max(600),stem:z.string().max(500),cognitiveLevel:blueprintSchema.shape.slots.element.shape.cognitiveLevel,sourceFragmentIds:z.array(z.string().max(80)).max(4)})).max(20)}),
  z.object({action:z.literal("analyze"),extracted:extractedDocumentSchema}),
  z.object({action:z.literal("generate"),document:normalizedDocumentSchema,analysis:analysisSchema,config:quizConfigSchema}),
  z.object({action:z.literal("regenerate"),document:normalizedDocumentSchema,analysis:analysisSchema,slot:blueprintSchema.shape.slots.element,questionId:z.string().max(80),avoidStems:z.array(z.string().max(1200)).max(20),existingQuestions:z.array(z.object({id:z.string().max(80),concept:z.string().max(80),conceptLabel:z.string().max(600),stem:z.string().max(500),cognitiveLevel:blueprintSchema.shape.slots.element.shape.cognitiveLevel,sourceFragmentIds:z.array(z.string().max(80)).max(4)})).max(20).default([])}),
]);
export async function GET(request:Request){
  const denied=await guardRequest(request);if(denied)return denied;
  try{return Response.json(await getProviderStatus(request.signal),{headers:{"Cache-Control":"no-store"}});}
  catch(e){return Response.json({configured:false,message:e instanceof IntelligenceError?e.message:"Revisa la configuración del proveedor."},{headers:{"Cache-Control":"no-store"}});}
}
export async function POST(request:Request){
  const denied=await guardRequest(request);if(denied)return denied;
  let hybrid=false;
  try{
    const input=requestSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request,2_000_000))));
    if(input.action==="prepare")return Response.json({prepared:analyzeDocumentDeterministically(input.extracted)},{headers:{"Cache-Control":"no-store"}});
    hybrid=input.action==="generateHybrid"||input.action==="regenerateHybrid";
    const provider=getProvider(request.signal);
    if(input.action==="generateHybrid"){const quiz=await generateHybridQuiz(input.prepared,input.config,provider);return Response.json({quiz,quality:validateQuiz(quiz)},{headers:{"Cache-Control":"no-store"}});}
    if(input.action==="regenerateHybrid")return Response.json(await regenerateHybridQuestion(input.prepared,input.slot,input.existingQuestions,provider),{headers:{"Cache-Control":"no-store"}});
    if(input.action==="analyze")return Response.json(await analyzeContent(input.extracted,provider),{headers:{"Cache-Control":"no-store"}});
    if(input.action==="generate"){
      const quiz=await buildEducationalQuiz(input.document,input.analysis,input.config,provider);
      return Response.json({quiz,quality:validateQuiz(quiz)},{headers:{"Cache-Control":"no-store"}});
    }
    return Response.json(await regenerate(input.document,input.analysis,input.slot,input.questionId,input.avoidStems,provider,input.existingQuestions),{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    const status=e instanceof BodyTooLargeError?413:e instanceof IntelligenceError?e.status:422;
    const error=hybrid&&e instanceof IntelligenceError&&[503,504].includes(e.status)?"El contenido está preparado, pero el servicio de generación de preguntas no está disponible.":e instanceof IntelligenceError?e.message:e instanceof BodyTooLargeError?"El contenido supera el límite de la solicitud.":e instanceof z.ZodError?"El documento o la respuesta estructurada no cumple el contrato. Vuelve a analizar el PDF.":"No se pudo completar la generación. Inténtalo nuevamente.";
    const debug=process.env.NODE_ENV==="development"&&e instanceof IntelligenceError&&e.diagnostic?{provider:e.diagnostic.provider,model:e.diagnostic.model,httpStatus:e.diagnostic.httpStatus,code:e.diagnostic.code,responseFormat:e.diagnostic.responseFormat}:undefined;
    return Response.json({error,...(debug?{debug}:{})},{status,headers:{"Cache-Control":"no-store"}});
  }
}
