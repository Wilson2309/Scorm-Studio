"use client";
import {useEffect} from "react";
import {browserSupabase} from "@/lib/supabase/browser";
import type {PublicSupabaseConfig} from "@/lib/supabase/config";
/** Supabase broadcasts sign-out across tabs. A full navigation clears user RSC
 * state and the document session instead of exposing the previous account. */
export function SessionBridge({config,userId}:{config:PublicSupabaseConfig;userId:string}){
 useEffect(()=>{const {data}=browserSupabase(config).auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_OUT"||event==="SIGNED_IN"&&session?.user.id!==userId)window.location.replace("/login");
 });return()=>data.subscription.unsubscribe();},[config,userId]);return null;
}
