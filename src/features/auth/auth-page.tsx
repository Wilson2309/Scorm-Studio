import {Suspense} from "react";
import {redirect} from "next/navigation";
import {LoginView} from "./login-view";
import {applicationURL,publicSupabaseConfig} from "@/lib/supabase/config";
import {requireIdentity} from "@/lib/auth/server";
import {AuthAccessError,safeNext} from "@/lib/auth/policy";
import type {AuthMode} from "@/lib/auth/flow";
type Props={mode:AuthMode;searchParams:Promise<Record<string,string|string[]|undefined>>};
async function AuthContent({mode,searchParams}:Props){
 const params=await searchParams,config=publicSupabaseConfig(),origin=applicationURL();
 if(mode==="reset"){
   try{await requireIdentity();}catch(error){if(error instanceof AuthAccessError)redirect("/recuperar?reason=expired");throw error;}
 }
 return <LoginView mode={mode} config={config} origin={origin} next={safeNext(params.next)} reason={typeof params.reason==="string"?params.reason:undefined} notice={typeof params.notice==="string"?params.notice:undefined}/>;
}
export function AuthPage(props:Props){return <Suspense fallback={<main className="auth-loading" role="status">Preparando tu acceso…</main>}><AuthContent {...props}/></Suspense>;}
