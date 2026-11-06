import {guardRequest} from "@/lib/auth/request";
import {privateHeaders,workspaceService,workspaceResponseError} from "@/lib/workspace/http.server";
export async function GET(request:Request){
 const denied=await guardRequest(request);if(denied)return denied;
 try{const service=await workspaceService();const [activities,pendingDocuments]=await Promise.all([service.recent(),service.pendingDocuments()]);return Response.json({activities,pendingDocuments},{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}
}
