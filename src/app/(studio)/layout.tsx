import { AppShell } from "@/components/layout/app-shell";
import {Suspense} from "react";
import {pageActor} from "@/lib/auth/server";
import {publicSupabaseConfig} from "@/lib/supabase/config";
async function AuthenticatedStudio({children}:{children:React.ReactNode}){const actor=await pageActor();return <AppShell actor={actor} config={publicSupabaseConfig()!}>{children}</AppShell>;}
export default function StudioLayout({children}:{children:React.ReactNode}){return <Suspense fallback={<main className="auth-loading" role="status">Abriendo tu espacio…</main>}><AuthenticatedStudio>{children}</AuthenticatedStudio></Suspense>;}
