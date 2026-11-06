import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "../supabase/database.types";
import {safeNext} from "./policy";
export type AuthMode="login"|"register"|"recover"|"reset";
const email=z.email("Escribe un correo válido.").max(254).transform(v=>v.trim().toLowerCase());
const password=z.string().min(8,"Usa al menos 8 caracteres.").max(128,"Usa como máximo 128 caracteres.");
const repeated={password,confirmPassword:z.string()};
export const authSchemas={
 login:z.object({email,password:z.string().min(1,"Escribe tu contraseña.").max(128)}).strict(),
 register:z.object({fullName:z.string().trim().min(2,"Escribe tu nombre.").max(100),email,...repeated}).strict().refine(v=>v.password===v.confirmPassword,{path:["confirmPassword"],message:"Las contraseñas no coinciden."}),
 recover:z.object({email}).strict(),
 reset:z.object(repeated).strict().refine(v=>v.password===v.confirmPassword,{path:["confirmPassword"],message:"Las contraseñas no coinciden."}),
};
export function authMessage(error:unknown){
 const code=error&&typeof error==="object"&&"code" in error?error.code:null;
 if(code==="invalid_credentials")return "El correo o la contraseña no son correctos.";
 if(code==="email_not_confirmed")return "Confirma tu correo antes de entrar. Revisa el enlace que recibiste al registrarte.";
 if(code==="weak_password")return "Esta contraseña no cumple la política de seguridad. Elige una más segura.";
 if(code==="over_request_rate_limit"||code==="over_email_send_rate_limit")return "Hay demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
 return "No se pudo completar la solicitud. Revisa tu conexión e inténtalo nuevamente.";
}
export class AuthFlowError extends Error{}
export async function performAuth(mode:AuthMode,values:unknown,client:Pick<SupabaseClient<Database>,"auth">,origin:string,next:unknown="/"):Promise<{redirect?:string;notice?:string}>{
 if(mode==="login"){
   const data=authSchemas.login.parse(values),result=await client.auth.signInWithPassword(data);
   if(result.error)throw new AuthFlowError(authMessage(result.error));return {redirect:safeNext(next)};
 }
 if(mode==="register"){
   const data=authSchemas.register.parse(values),redirect=new URL("/auth/callback",origin);redirect.searchParams.set("next",safeNext(next));
   const result=await client.auth.signUp({email:data.email,password:data.password,options:{data:{full_name:data.fullName},emailRedirectTo:redirect.href}});
   if(result.error)throw new AuthFlowError(authMessage(result.error));
   return result.data.session?{redirect:safeNext(next)}:{notice:"Si el correo puede registrarse, recibirás un enlace para confirmar tu cuenta. Revisa también la carpeta de spam."};
 }
 if(mode==="recover"){
   const data=authSchemas.recover.parse(values),target=new URL("/auth/callback",origin);target.searchParams.set("next","/restablecer");
   const result=await client.auth.resetPasswordForEmail(data.email,{redirectTo:target.href});
   if(result.error)throw new AuthFlowError(authMessage(result.error));return {notice:"Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña."};
 }
 const data=authSchemas.reset.parse(values),identity=await client.auth.getUser();
 if(identity.error||!identity.data.user)throw new AuthFlowError("El enlace o la sesión expiraron. Solicita un nuevo enlace de recuperación.");
 const result=await client.auth.updateUser({password:data.password});if(result.error)throw new AuthFlowError(authMessage(result.error));
 const logout=await client.auth.signOut({scope:"global"});if(logout.error)throw new AuthFlowError("La contraseña cambió, pero no se pudo cerrar la sesión. Vuelve a intentar cerrar sesión.");
 return {redirect:"/login?notice=password-updated"};
}
