import {Suspense} from "react";
import {pageActor} from "@/lib/auth/server";
import {RouletteEditor} from "@/features/roulette/roulette-editor";
export const metadata={title:"Ruleta educativa"};
async function AuthorizedRoulette(){await pageActor();return <RouletteEditor/>;}
export default function Page(){return <Suspense fallback={<p role="status">Recuperando tu ruleta…</p>}><AuthorizedRoulette/></Suspense>;}
