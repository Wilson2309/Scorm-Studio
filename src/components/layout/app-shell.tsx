"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutGrid, History, Plus, ShieldCheck, LogOut, ArrowUpRight } from "lucide-react";
import {Brand} from "./brand";
export {Brand} from "./brand";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import { DocumentProvider,useDocumentSelection } from "@/components/generator/document-context";
import {useState} from "react";
import type {Actor} from "@/lib/auth/policy";
import type {PublicSupabaseConfig} from "@/lib/supabase/config";
import {browserSupabase} from "@/lib/supabase/browser";
import {SessionBridge} from "@/features/auth/session-bridge";

const navigation = [{ href: "/", label: "Mi espacio", icon: LayoutGrid }, { href: "/crear", label: "Crear actividad", icon: Plus }, { href: "/historial", label: "Historial", icon: History }];
export function Navigation() {
  const path = usePathname();
  const reduced = useReducedMotion();
  return <nav className="main-nav" aria-label="Navegación principal">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={cn("nav-link", path === href && "active")}><Icon size={17} aria-hidden="true" /><span>{label}</span>{path === href && <motion.span className="nav-active-indicator" layoutId="studio-navigation" transition={{ duration: reduced ? 0 : .24 }} />}</Link>)}</nav>;
}
export function UserMenu({actor,config}:{actor:Actor;config:PublicSupabaseConfig}) {
  const {flushSaves,discardSaves}=useDocumentSelection();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");const name=actor.full_name||"Docente",initials=name.split(/\s+/).slice(0,2).map(n=>n[0]).join("").toUpperCase();
  async function logout(discard=false){if(busy)return;setBusy(true);setError("");try{if(discard){if(!window.confirm("¿Cerrar sesión sin guardar los cambios pendientes? Descarga antes una copia desde la actividad.")){setBusy(false);return;}discardSaves();}else await flushSaves();const {error}=await browserSupabase(config).auth.signOut({scope:"local"});if(error)throw new Error("No se pudo cerrar la sesión. Inténtalo nuevamente.");window.location.replace("/login");}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar antes de salir.");setBusy(false);}}
  return <details className="user-menu"><summary><span className="avatar">{initials}</span><span className="user-label">{name}<small>{actor.role==="ADMIN"?"Administración":"Espacio docente"}</small></span><ChevronDown size={14} aria-hidden="true" /></summary><div className="user-popover"><p>{name}<small>{actor.email}</small></p>{actor.role==="ADMIN"&&<Link href="/admin"><ShieldCheck size={16} />Administración</Link>}<button type="button" disabled={busy} onClick={()=>logout()}><LogOut size={16}/>{busy?"Guardando y saliendo…":"Cerrar sesión"}</button>{error&&<><p role="alert">{error}</p><button type="button" disabled={busy} onClick={()=>logout(true)}>Salir sin guardar</button></>}</div></details>;
}
export function Header({actor,config}:{actor:Actor;config:PublicSupabaseConfig}) { return <header className="app-header"><div className="header-inner"><Brand /><Navigation /><UserMenu actor={actor} config={config}/></div></header>; }
export function AppShell({children,actor,config}:{children:ReactNode;actor:Actor;config:PublicSupabaseConfig}) { return <MotionConfig reducedMotion="user"><DocumentProvider key={actor.id}><SessionBridge config={config} userId={actor.id}/><a className="skip-link" href="#main-content">Saltar al contenido</a><Header actor={actor} config={config}/><main id="main-content" className="workspace">{children}</main><footer className="app-footer"><span>Hecho para enseñar. Diseñado para crear.</span><span>SCORM Studio <span className="footer-dot">·</span> Vista de desarrollo <ArrowUpRight size={13} aria-hidden="true" /></span></footer></DocumentProvider></MotionConfig>; }
