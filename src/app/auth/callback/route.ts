import {finishAuth} from "@/lib/auth/callback";
export function GET(request:Request){return finishAuth(request);}
