import Link from "next/link";
import {Suspense} from "react";
import {ArrowRight} from "lucide-react";
import {serverSupabase} from "@/lib/supabase/server";
import {LandingContent} from "@/features/landing/landing-content";
import styles from "@/features/landing/landing.module.css";

export const metadata={title:"De tu documento a una experiencia de aprendizaje",description:"Sube un PDF, prepara actividades interactivas, revísalas como docente y exporta SCORM 1.2 para Moodle con SCORM Studio."};
async function StudioAccess(){
 const client=await serverSupabase();let signedIn=false;
 if(client){try{const {data}=await client.auth.getUser();signedIn=!!data.user;}catch{/* Public content remains available if Auth is temporarily unavailable. */}}
 return <Link className={styles.headerCta} href={signedIn?"/":"/login"}>{signedIn?"Ir a mi estudio":"Iniciar sesión"}<ArrowRight size={16}/></Link>;
}
export default function Landing(){return <LandingContent access={<Suspense fallback={<Link className={styles.headerCta} href="/login">Iniciar sesión<ArrowRight size={16}/></Link>}><StudioAccess/></Suspense>}/>;}
