import {guardRequest} from "@/lib/auth/request";
import {requireIdentity} from "@/lib/auth/server";
import {historyFiltersSchema} from "@/lib/workspace/history-contracts";
import {readHistory} from "@/lib/workspace/history.server";
import {privateHeaders,workspaceResponseError} from "@/lib/workspace/http.server";
export async function GET(request:Request){const denied=await guardRequest(request);if(denied)return denied;try{const {client,user}=await requireIdentity(),filters=historyFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams));return Response.json(await readHistory(client,user.id,filters),{headers:privateHeaders});}catch(error){return workspaceResponseError(error);}}
