import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "../supabase/database.types";
import {workspaceFailure,WorkspaceError} from "./errors";
import {workspaceId,workspaceStates} from "./contracts";
import {historyFiltersSchema,literalTitlePattern,type HistoryFilters,type HistoryItem} from "./history-contracts";

const columns="id,document_id,title,activity_type,status,question_count,current_revision,current_package_id,deleting_at,created_at,updated_at";
const rowSchema=z.object({id:workspaceId,document_id:workspaceId,title:z.string(),activity_type:z.enum(["QUIZ","ROULETTE","TIMELINE","SIMULATION"]).default("QUIZ"),status:workspaceStates,question_count:z.number(),current_revision:z.number(),current_package_id:workspaceId.nullable(),deleting_at:z.string().nullable(),created_at:z.string(),updated_at:z.string()});
const unavailable=()=>new WorkspaceError(503,"history_unavailable","No se pudo consultar tu biblioteca. Vuelve a intentarlo.");

/** Session client + explicit owner + RLS. Never select canonical text or draft JSON for a list. */
export async function readHistory(client:SupabaseClient<Database>,owner:string,input:HistoryFilters,options:{excludeDeleting?:boolean}={}){
 const filters=historyFiltersSchema.parse(input);
 function query(page:number){
  let q=client.from("generations").select(columns,{count:"exact"}).eq("user_id",owner);
  if(options.excludeDeleting)q=q.is("deleting_at",null);
  if(filters.q)q=q.ilike("title",literalTitlePattern(filters.q));
  if(filters.status!=="ALL")q=q.eq("status",filters.status);
  const sort=filters.order==="updated_desc"?"updated_at":"created_at",ascending=filters.order==="created_asc";
  return q.order(sort,{ascending}).order("id",{ascending}).range((page-1)*filters.pageSize,page*filters.pageSize-1);
 }
 let result=await query(filters.page);
 // A deleted last page or a stale URL is recoverable. At most one metadata retry.
 if(result.error?.code==="PGRST103"||(result.count!==null&&filters.page>1&&(filters.page-1)*filters.pageSize>=result.count)){filters.page=1;result=await query(1);}
 if(result.error)workspaceFailure(result.error);if(result.count===null)throw unavailable();
 const rows=z.array(rowSchema).parse(result.data??[]),documentIds=[...new Set(rows.map(r=>r.document_id))],packageIds=rows.flatMap(r=>r.current_package_id?[r.current_package_id]:[]);
 const [docs,packages]=await Promise.all([
  documentIds.length?client.from("documents").select("id,filename").eq("user_id",owner).in("id",documentIds):Promise.resolve({data:[],error:null}),
  packageIds.length?client.from("scorm_packages").select("id,generation_id,revision,status,file_size").eq("user_id",owner).in("id",packageIds):Promise.resolve({data:[],error:null})
 ]);
 if(docs.error)workspaceFailure(docs.error);if(packages.error)workspaceFailure(packages.error);
 const documents=z.array(z.object({id:workspaceId,filename:z.string()})).parse(docs.data),artifacts=z.array(z.object({id:workspaceId,generation_id:workspaceId,revision:z.number(),status:z.string(),file_size:z.number().nullable()})).parse(packages.data);
 const items:HistoryItem[]=rows.map(r=>{const doc=documents.find(d=>d.id===r.document_id);if(!doc)throw unavailable();const p=artifacts.find(p=>p.id===r.current_package_id&&p.generation_id===r.id&&p.status==="READY"&&p.revision===r.current_revision);return {id:r.id,type:r.activity_type,title:r.title,documentId:r.document_id,document:doc.filename,status:r.status,questions:r.question_count,revision:r.current_revision,createdAt:r.created_at,updatedAt:r.updated_at,deleting:!!r.deleting_at,hasPackage:!!p&&!r.deleting_at,packageSize:p?.file_size??null};});
 return {items,total:result.count,filters};
}
export async function readWorkspaceSummary(client:SupabaseClient<Database>,owner:string){
 const count=(status?:"SCORM_GENERATED"|"pending")=>{let q=client.from("generations").select("id",{head:true,count:"exact"}).eq("user_id",owner).is("deleting_at",null);if(status==="pending")q=q.neq("status","SCORM_GENERATED");else if(status)q=q.eq("status",status);return q;};
 const [total,pending,packages,recent]=await Promise.all([count(),count("pending"),count("SCORM_GENERATED"),readHistory(client,owner,historyFiltersSchema.parse({pageSize:3}),{excludeDeleting:true})]);
 for(const result of [total,pending,packages]){if(result.error)workspaceFailure(result.error);if(result.count===null)throw unavailable();}
 return {total:total.count!,pending:pending.count!,packages:packages.count!,recent:recent.items};
}
