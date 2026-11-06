import {guardRequest} from "@/lib/auth/request";
import {boundedBody} from "@/lib/http/bounded-body";
import {workspaceId} from "@/lib/workspace/contracts";
import {privateHeaders,workspaceService,workspaceResponseError} from "@/lib/workspace/http.server";
export async function POST(request:Request){
 const denied=await guardRequest(request);if(denied)return denied;
 try{
  const bytes=await boundedBody(request,21*1024*1024),form=await new Response(bytes,{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData();
  const file=form.get("file");if(!(file instanceof File))return Response.json({error:"Selecciona el PDF original."},{status:400,headers:privateHeaders});
  const documentId=workspaceId.parse(form.get("documentId")),generationId=workspaceId.parse(form.get("generationId"));
  return Response.json(await(await workspaceService()).prepare(file,documentId,generationId),{headers:privateHeaders});
 }catch(error){return workspaceResponseError(error);}
}
