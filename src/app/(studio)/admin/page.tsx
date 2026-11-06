import { AdminView } from "@/features/admin/admin-view";
import {Suspense} from "react";
import {pageActor} from "@/lib/auth/server";
export const metadata = { title: "Administración" };
async function AuthorizedAdmin(){const actor=await pageActor(true);return <AdminView actorId={actor.id}/>;}
export default function Page(){return <Suspense fallback={<p role="status">Verificando el acceso…</p>}><AuthorizedAdmin/></Suspense>;}
