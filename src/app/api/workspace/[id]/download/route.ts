import {guardRequest} from "@/lib/auth/request";
import {privateHeaders,workspaceService,workspaceResponseError} from "@/lib/workspace/http.server";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const denied=await guardRequest(request);if(denied)return denied;
 try{
  const result=await(await workspaceService()).downloadPackage((await context.params).id);
  if(new URL(request.url).searchParams.get("preview")==="1")return new Response(result.preview,{headers:{...privateHeaders,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'; sandbox allow-scripts","X-Content-Type-Options":"nosniff"}});
  return new Response(new Uint8Array(result.bytes),{headers:{...privateHeaders,"Content-Type":"application/zip","Content-Disposition":"attachment; filename=scorm-studio-quiz.zip","X-Content-Type-Options":"nosniff"}});
 }catch(error){return workspaceResponseError(error);}
}
