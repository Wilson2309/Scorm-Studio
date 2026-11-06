import "server-only";
import {z} from "zod";
import {requireIdentity} from "../auth/server";
import {supabaseWorkspacePort} from "./supabase-port.server";
import {WorkspaceService,PendingDraftError} from "./service.server";
import {WorkspaceError} from "./errors";
import {getProvider,IntelligenceError} from "../content/provider.server";
import {BodyTooLargeError} from "../http/bounded-body";
import {AssessmentCapacityError} from "../content/hybrid-plan";
export const privateHeaders={"Cache-Control":"private, no-store","Pragma":"no-cache"};
export async function workspaceService(signal?:AbortSignal){const {user,client}=await requireIdentity();return new WorkspaceService(supabaseWorkspacePort(client),user.id,()=>getProvider(signal));}
export function workspaceResponseError(error:unknown){
 if(error instanceof PendingDraftError)return Response.json({error:error.message,code:error.code,recovery:error.recovery},{status:error.status,headers:privateHeaders});
 if(error instanceof WorkspaceError)return Response.json({error:error.message,code:error.code},{status:error.status,headers:privateHeaders});
 if(error instanceof AssessmentCapacityError)return Response.json({error:error.message,code:error.code,available:error.available},{status:422,headers:privateHeaders});
 if(error instanceof BodyTooLargeError)return Response.json({error:"La solicitud supera el tamaño permitido.",code:"body_limit"},{status:413,headers:privateHeaders});
 if(error instanceof IntelligenceError)return Response.json({error:error.message,code:"generation_failed"},{status:error.status,headers:privateHeaders});
 if(error instanceof z.ZodError)return Response.json({error:"El trabajo no cumple el formato esperado. Conserva tus cambios y revisa la actividad.",code:"invalid_workspace_data"},{status:422,headers:privateHeaders});
 const kind=error instanceof TypeError?"TypeError":error instanceof RangeError?"RangeError":error instanceof SyntaxError?"SyntaxError":"UnexpectedError";
 console.error("workspace_unexpected_failure",{kind});
 return Response.json({error:"No se pudo completar la operación por un problema técnico. Conserva tu trabajo y vuelve a intentarlo.",code:"workspace_unavailable"},{status:503,headers:privateHeaders});
}
