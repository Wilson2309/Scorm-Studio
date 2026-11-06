"use client";
import "./roulette.css";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/primitives";
import {useDocumentSelection} from "@/components/generator/document-context";
import {workspaceCommand} from "@/lib/workspace/client";
export function CreateRoulette({disabled=false}:{disabled?:boolean}){
 const {flushSaves,getWorkspace}=useDocumentSelection(),router=useRouter(),intent=useRef<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function create(){if(busy)return;setBusy(true);setError("");try{await flushSaves();const source=getWorkspace();if(!source)throw Error("Guarda el cuestionario antes de crear una ruleta.");if(!intent.current)intent.current=crypto.randomUUID();await workspaceCommand(source.generationId,{action:"roulette",expectedRevision:source.revision,generationId:intent.current});router.push(`/ruleta?generation=${intent.current}`);}catch(e){setError(e instanceof Error?e.message:"No se pudo crear la ruleta.");}finally{setBusy(false);}}
 return <div className="roulette-create"><Button variant="secondary" disabled={disabled||busy} onClick={create}>{busy?"Preparando ruleta…":"Crear ruleta con estas preguntas"}</Button><p>Reutiliza el PDF y sus fuentes. Conserva este quiz y crea una actividad nueva, sin IA adicional.</p>{error&&<p role="alert">{error}</p>}</div>;
}
