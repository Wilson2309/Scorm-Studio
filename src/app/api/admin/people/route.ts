import {peopleFilters,peopleSchema} from "@/lib/admin/contracts";
import {adminHeaders,adminRPC,adminResponseError,guardAdmin} from "@/lib/admin/server";
export async function GET(request:Request){const denied=await guardAdmin(request);if(denied)return denied;try{const f=peopleFilters.parse(Object.fromEntries(new URL(request.url).searchParams));return Response.json(await adminRPC("admin_people",{p_query:f.q,p_role:f.role,p_order:f.order,p_page:f.page,p_size:f.pageSize},peopleSchema),{headers:adminHeaders});}catch(e){return adminResponseError(e);}}
