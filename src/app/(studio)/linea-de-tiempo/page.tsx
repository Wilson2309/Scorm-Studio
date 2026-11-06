import {Suspense} from "react";
import {pageActor} from "@/lib/auth/server";
import {TimelineEditor} from "@/features/timeline/timeline-editor";
export const metadata={title:"Línea de tiempo educativa"};
async function AuthorizedTimeline(){await pageActor();return <TimelineEditor/>;}
export default function Page(){return <Suspense fallback={<p role="status">Recuperando tu línea de tiempo…</p>}><AuthorizedTimeline/></Suspense>;}
