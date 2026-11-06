import {peopleSchema} from "@/lib/admin/contracts";
import {workspaceId} from "@/lib/workspace/contracts";
import {AdminError,adminHeaders,adminRPC,adminResponseError,guardAdmin} from "@/lib/admin/server";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const denied=await guardAdmin(request);if(denied)return denied;try{const id=workspaceId.parse((await context.params).id),result=await adminRPC("admin_people",{p_id:id},peopleSchema);if(!result.items.length)throw new AdminError(404,"account_unavailable","La cuenta no está disponible.");return Response.json({person:result.items[0],adminCount:result.adminCount},{headers:adminHeaders});}catch(e){return adminResponseError(e);}}
