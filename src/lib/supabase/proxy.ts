import {createServerClient} from "@supabase/ssr";
import {NextResponse,type NextRequest} from "next/server";
import {publicSupabaseConfig} from "./config";
import {privatePage,safeNext} from "../auth/policy";
export async function updateSession(request:NextRequest){
 let response=NextResponse.next({request});const config=publicSupabaseConfig();let signedIn=false;
 if(config){
   const client=createServerClient(config.url,config.publishableKey,{
     global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store",signal:init?.signal??AbortSignal.timeout(15000)})},
     cookies:{getAll:()=>request.cookies.getAll(),setAll(values,cacheHeaders){
       for(const {name,value} of values)request.cookies.set(name,value);
       const previous=response.cookies.getAll();response=NextResponse.next({request});
       for(const cookie of previous)response.cookies.set(cookie);
       for(const {name,value,options} of values)response.cookies.set(name,value,options);
       if(cacheHeaders)for(const [key,value] of Object.entries(cacheHeaders))response.headers.set(key,value);
     }},
   });
   try{const {data,error}=await client.auth.getClaims();signedIn=!error&&typeof data?.claims.sub==="string";}catch{/* Fail closed; API/DAL revalidates independently. */}
 }
 if(privatePage(request.nextUrl.pathname)&&!signedIn){
   const entry=request.nextUrl.pathname==="/",target=new URL(entry?"/inicio":"/login",request.url);if(!entry){target.searchParams.set("next",safeNext(request.nextUrl.pathname+request.nextUrl.search));if(!config)target.searchParams.set("reason","unavailable");}
   const redirected=NextResponse.redirect(target);for(const cookie of response.cookies.getAll())redirected.cookies.set(cookie);response=redirected;
 }
 response.headers.set("Cache-Control","private, no-store");response.headers.set("Pragma","no-cache");response.headers.set("Expires","0");return response;
}
