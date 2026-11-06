import "server-only";
import {cache} from "react";
import {redirect} from "next/navigation";
import {serverSupabase} from "../supabase/server";
import {AuthAccessError,actorFromProfile,assertAdmin,type Actor} from "./policy";
/** React cache is request-local. No 'use cache', global client or shared user cache. */
export const requireIdentity=cache(async()=>{
 const client=await serverSupabase();if(!client)throw new AuthAccessError(503,"unavailable");
 const {data,error}=await client.auth.getUser();
 if(error||!data.user){if(error&&(!error.status||error.status>=500))throw new AuthAccessError(503,"unavailable");throw new AuthAccessError(401,"unauthenticated");}
 return {client,user:data.user};
});
export const requireActor=cache(async():Promise<Actor>=>{
 const {client,user}=await requireIdentity();
 const {data,error}=await client.from("profiles").select("id,full_name,role").eq("id",user.id).single();
 if(error)throw new AuthAccessError(503,"profile_missing");
 return actorFromProfile(user,data);
});
export async function pageActor(admin=false){
 try{const actor=await requireActor();return admin?assertAdmin(actor):actor;}
 catch(error){if(error instanceof AuthAccessError)redirect(error.status===401?"/login?reason=expired":error.status===403?"/?notice=forbidden":error.code==="profile_missing"?"/login?reason=profile-pending":"/login?reason=unavailable");throw error;}
}
