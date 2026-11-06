import {guardRequest} from "@/lib/auth/request";
import {privateHeaders,workspaceService,workspaceResponseError} from "@/lib/workspace/http.server";
import {boundedBody} from "@/lib/http/bounded-body";
import {workspaceId} from "@/lib/workspace/contracts";
import {z} from "zod";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){const denied=await guardRequest(request);if(denied)return denied;
 try{const result=await(await workspaceService()).downloadPDF((await context.params).id);return new Response(new Uint8Array(result.bytes),{headers:{...privateHeaders,"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=original.pdf"}});}catch(error){return workspaceResponseError(error);}
}
export async function DELETE(request:Request,context:Context){const denied=await guardRequest(request);if(denied)return denied;
 try{await(await workspaceService()).remove((await context.params).id,true);return Response.json({deleted:true},{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}
}
export async function POST(request:Request,context:Context){const denied=await guardRequest(request);if(denied)return denied;
 try{const input=z.object({generationId:workspaceId}).strict().parse(JSON.parse(new TextDecoder().decode(await boundedBody(request,4096))));return Response.json({snapshot:await(await workspaceService()).resumeDocument((await context.params).id,input.generationId)},{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}
}
