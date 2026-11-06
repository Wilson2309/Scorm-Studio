import {z} from "zod";
import {workspaceId} from "./contracts";
export class WorkspaceClientError extends Error{
 constructor(message:string,readonly code:string,readonly recovery?:{quiz:unknown;operationId:string;generationId:string}){super(message);}
}
export async function workspaceRequest(path:string,init?:RequestInit){
 const response=await fetch(path,{...init,cache:"no-store"});let result:unknown;
 try{result=await response.json();}catch{throw new WorkspaceClientError("No se recibió una respuesta de guardado. Conserva tus cambios y reintenta.","network_error");}
 if(!response.ok){const error=z.object({error:z.string(),code:z.string().optional(),recovery:z.object({quiz:z.unknown(),operationId:workspaceId,generationId:workspaceId}).optional()}).safeParse(result);
  if(error.success)throw new WorkspaceClientError(error.data.error,error.data.code??"workspace_error",error.data.recovery);
  throw new WorkspaceClientError("No se pudo guardar el trabajo. Inténtalo de nuevo.","network_error");
 }
 return result;
}
export function workspaceCommand(id:string,command:unknown,signal?:AbortSignal){return workspaceRequest(`/api/workspace/${id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command),signal});}
