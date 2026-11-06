import {z} from "zod";
export const profileSchema=z.object({id:z.uuid(),full_name:z.string().max(100),role:z.enum(["TEACHER","ADMIN"])}).strict();
export type Actor=z.infer<typeof profileSchema>&{email:string};
export class AuthAccessError extends Error{constructor(public status:401|403|503,public code:"unauthenticated"|"forbidden"|"unavailable"|"profile_missing"){super(code==="unauthenticated"?"Tu sesión terminó. Inicia sesión para continuar.":code==="forbidden"?"No tienes permiso para acceder a esta sección.":code==="profile_missing"?"Tu perfil aún no está disponible. Contacta con la administración.":"El acceso no está disponible en este momento. Inténtalo nuevamente.");}}
export function privatePage(path:string){return path==="/"||["/crear","/ruleta","/linea-de-tiempo","/simulacion","/historial","/admin"].some(p=>path===p||path.startsWith(p+"/"));}
export function safeNext(value:unknown,fallback="/"){
  if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//")||/[\\\r\n\u0000]/.test(value))return fallback;
  try{const decoded=decodeURIComponent(value);if(decoded.startsWith("//")||decoded.includes("\\"))return fallback;const url=new URL(value,"https://studio.invalid");if(url.origin!=="https://studio.invalid"||(!privatePage(url.pathname)&&url.pathname!=="/restablecer"))return fallback;for(const key of ["code","token_hash","access_token","refresh_token"])url.searchParams.delete(key);return url.pathname+url.search;}catch{return fallback;}
}
export function actorFromProfile(user:{id:string;email?:string},value:unknown):Actor{
 const parsed=profileSchema.safeParse(value);if(!parsed.success||parsed.data.id!==user.id)throw new AuthAccessError(503,"profile_missing");return {...parsed.data,email:user.email??""};
}
export function assertAdmin(actor:Actor){if(actor.role!=="ADMIN")throw new AuthAccessError(403,"forbidden");return actor;}
export function authErrorResponse(error:unknown){const e=error instanceof AuthAccessError?error:new AuthAccessError(503,"unavailable");return Response.json({error:e.message,code:e.code},{status:e.status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});}
