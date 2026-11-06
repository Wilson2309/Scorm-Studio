import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database,Json} from "../supabase/database.types";
import type {WorkspacePort} from "./port";
import {workspaceFailure} from "./errors";
import {sha256} from "./seal.server";
export function supabaseWorkspacePort(client:SupabaseClient<Database>):WorkspacePort{
 return {
  async read(table,filters,limit=1){let q=client.from(table).select("*");for(const [name,value] of Object.entries(filters))q=q.eq(name,value);const {data,error}=await q.order(table==="quiz_drafts"?"updated_at":"created_at",{ascending:false}).limit(limit);if(error)workspaceFailure(error);return data??[];},
  async rpc(name,args){const {data,error}=await client.rpc(name,args as Record<string,Json>);if(error)workspaceFailure(error);return data;},
  async upload(bucket,path,bytes,contentType){
   const {error}=await client.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});
   if(!error)return;
   // Retry finalization after an interrupted upload, but never overwrite different bytes.
   // Storage's statusCode can contain an application/PostgreSQL code. Prefer HTTP status.
   if([400,409].includes(Number(error.status??error.statusCode))){
    const {data,error:readError}=await client.storage.from(bucket).download(path);
    if(!readError&&data&&sha256(new Uint8Array(await data.arrayBuffer()))===sha256(bytes))return;
   }
   workspaceFailure(error);
  },
  async download(bucket,path){const {data,error}=await client.storage.from(bucket).download(path);if(error||!data)workspaceFailure(error);return new Uint8Array(await data.arrayBuffer());},
  async remove(bucket,paths){if(!paths.length)return;const {error}=await client.storage.from(bucket).remove(paths);if(error)workspaceFailure(error);}
 };
}
