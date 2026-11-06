import {guardRequest} from "@/lib/auth/request";
import {requireIdentity} from "@/lib/auth/server";
import {readWorkspaceSummary} from "@/lib/workspace/history.server";
import {privateHeaders,workspaceResponseError} from "@/lib/workspace/http.server";
export async function GET(request:Request){const denied=await guardRequest(request);if(denied)return denied;try{const {client,user}=await requireIdentity();return Response.json(await readWorkspaceSummary(client,user.id),{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}}
