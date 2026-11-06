import { Dashboard } from "@/components/dashboard/dashboard";
import {Suspense} from "react";
import {pageActor} from "@/lib/auth/server";
async function TeacherHome(){const actor=await pageActor();return <Dashboard fullName={actor.full_name||"Docente"}/>;}
export default function Home(){return <Suspense fallback={<p role="status">Abriendo tu estudio…</p>}><TeacherHome/></Suspense>;}
