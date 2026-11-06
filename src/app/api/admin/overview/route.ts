import {overviewFilters,overviewSchema} from "@/lib/admin/contracts";
import {adminHeaders,adminRPC,adminResponseError,guardAdmin} from "@/lib/admin/server";
export async function GET(request:Request){const denied=await guardAdmin(request);if(denied)return denied;try{const f=overviewFilters.parse(Object.fromEntries(new URL(request.url).searchParams));return Response.json(await adminRPC("admin_overview",{p_days:f.days},overviewSchema),{headers:adminHeaders});}catch(e){return adminResponseError(e);}}
