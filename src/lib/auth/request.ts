import "server-only";
import {requireActor} from "./server";
import {authErrorResponse} from "./policy";
import {applicationURL} from "../supabase/config";
export async function guardRequest(request:Request):Promise<Response|null>{
 try{await requireActor();}catch(error){return authErrorResponse(error);}
 if(!["GET","HEAD","OPTIONS"].includes(request.method)){
   const origin=applicationURL();if(!origin)return Response.json({error:"El acceso no está disponible en este momento."},{status:503,headers:{"Cache-Control":"private, no-store"}});
   if(request.headers.get("origin")!==origin)return Response.json({error:"La solicitud no procede de este espacio."},{status:403,headers:{"Cache-Control":"private, no-store"}});
 }
 return null;
}
