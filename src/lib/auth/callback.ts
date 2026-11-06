import "server-only";
import {NextResponse} from "next/server";
import {serverSupabase} from "../supabase/server";
import {applicationURL} from "../supabase/config";
import {safeNext} from "./policy";
export async function finishAuth(request:Request,tokenHash=false){
 const url=new URL(request.url),origin=applicationURL();
 if(!origin)return NextResponse.json({error:"El acceso no está disponible en este momento."},{status:503,headers:{"Cache-Control":"private, no-store"}});
 const target=(path:string)=>{const response=NextResponse.redirect(new URL(path,origin),303);response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");return response;};
 const client=await serverSupabase(true);if(!client)return target("/login?reason=unavailable");
 try{
   const code=url.searchParams.get("code"),hash=url.searchParams.get("token_hash"),type=url.searchParams.get("type");
   if(tokenHash&&hash&&(type==="email"||type==="recovery")){
     const result=await client.auth.verifyOtp({token_hash:hash,type});if(!result.error)return target(type==="recovery"?"/restablecer":safeNext(url.searchParams.get("next")));
   }else if(!tokenHash&&code){const result=await client.auth.exchangeCodeForSession(code);if(!result.error)return target(safeNext(url.searchParams.get("next")));}
 }catch{/* Never expose provider payloads, callback codes or token hashes. */}
 return target("/recuperar?reason=invalid-link");
}
