import {roleChangeSchema,roleResultSchema} from "@/lib/admin/contracts";
import {workspaceId} from "@/lib/workspace/contracts";
import {boundedBody} from "@/lib/http/bounded-body";
import {adminHeaders,adminRPC,adminResponseError,guardAdmin} from "@/lib/admin/server";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const denied=await guardAdmin(request);if(denied)return denied;try{const id=workspaceId.parse((await context.params).id),input=roleChangeSchema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request,8192))));return Response.json(await adminRPC("admin_change_role",{p_target:id,p_role:input.role,p_expected_role:input.expectedRole,p_request:input.requestId,p_reason:input.reason},roleResultSchema),{headers:adminHeaders});}catch(e){return adminResponseError(e);}}
