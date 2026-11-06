import "server-only";
import {z} from "zod";
import {requireActor,requireIdentity} from "../auth/server";
import {assertAdmin,AuthAccessError,authErrorResponse} from "../auth/policy";
import {guardRequest} from "../auth/request";
import type {Json} from "../supabase/database.types";
import type {AdminRPC} from "./contracts";
import {BodyTooLargeError} from "../http/bounded-body";
export class AdminError extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message);}}
export const adminHeaders={"Cache-Control":"private, no-store","Vary":"Cookie"};
export async function guardAdmin(request:Request){const denied=await guardRequest(request);if(denied)return denied;try{assertAdmin(await requireActor());return null;}catch(e){return authErrorResponse(e);}}
export function adminFailure(error:{code?:string;message?:string}):never{
 if(["PGRST202","42883","42P01"].includes(error.code??""))throw new AdminError(503,"admin_activation_pending","La administración está pendiente de activar su migración. No se muestran datos de demostración.");
 if(error.code==="42501")throw new AuthAccessError(403,"forbidden");
 if(error.code==="P0002")throw new AdminError(404,"account_unavailable","La cuenta no existe o no está confirmada para esta operación.");
 if(error.code==="PT409")throw new AdminError(409,"admin_conflict",error.message==="last_admin_required"?"Debe permanecer al menos una cuenta ADMIN. No se realizó el cambio.":"El rol o la solicitud cambió. Actualiza los datos antes de confirmar otra operación.");
 if(error.code==="22023")throw new AdminError(400,"invalid_admin_input","Revisa los filtros o los datos del cambio de rol.");
 throw new AdminError(503,"admin_unavailable","No se pudo consultar la administración. Vuelve a intentarlo.");
}
export async function adminRPC<T>(name:AdminRPC,args:Record<string,Json>,schema:z.ZodType<T>){assertAdmin(await requireActor());const {client}=await requireIdentity();const {data,error}=await client.rpc(name,args);if(error)adminFailure(error);return schema.parse(data);}
export function adminResponseError(e:unknown){if(e instanceof AuthAccessError)return authErrorResponse(e);if(e instanceof BodyTooLargeError)return Response.json({error:"La solicitud supera el tamaño permitido.",code:"body_limit"},{status:413,headers:adminHeaders});if(e instanceof SyntaxError)return Response.json({error:"La solicitud no contiene JSON válido.",code:"invalid_json"},{status:400,headers:adminHeaders});if(e instanceof z.ZodError)return Response.json({error:"La solicitud o respuesta administrativa no tiene el formato esperado.",code:"invalid_admin_data"},{status:422,headers:adminHeaders});if(e instanceof AdminError)return Response.json({error:e.message,code:e.code},{status:e.status,headers:adminHeaders});return Response.json({error:"No se pudo completar la operación administrativa.",code:"admin_unavailable"},{status:503,headers:adminHeaders});}
