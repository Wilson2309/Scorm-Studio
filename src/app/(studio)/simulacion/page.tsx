import {Suspense} from "react";
import {pageActor} from "@/lib/auth/server";
import {SimulationEditor} from "@/features/simulation/simulation-editor";
async function PrivateEditor(){await pageActor();return <SimulationEditor/>;}
export default function SimulationPage(){return <Suspense fallback={<p role="status">Recuperando tu espacio…</p>}><PrivateEditor/></Suspense>;}
