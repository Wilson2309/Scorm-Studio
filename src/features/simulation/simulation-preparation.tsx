"use client";
import {useMemo,useRef,useState,useEffect} from "react";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/primitives";
import {PipelineProgress} from "@/components/ui/pipeline-progress";
import {useDocumentSelection} from "@/components/generator/document-context";
import {selectSimulationDecisions} from "@/lib/activities/simulation-decision-plan";
import {decisionCountLabel} from "@/lib/activities/activity-presentation";
import {detectSimulationRules} from "@/lib/activities/simulation-detection";
import {academicDraftIdeas,simulationAdvisory} from "@/lib/activities/draft-suitability";
import type {HybridPrepared} from "@/lib/content/hybrid-schema";
import {workspaceCommand} from "@/lib/workspace/client";
import {parseWorkspaceSnapshot} from "@/lib/workspace/contracts";
import styles from "@/features/timeline/timeline.module.css";
export function SimulationPreparation({prepared}:{prepared:HybridPrepared}){
 const rules=useMemo(()=>detectSimulationRules(prepared.document.fragments),[prepared]),router=useRouter(),{getWorkspace,flushSaves,acceptWorkspace}=useDocumentSelection();
 const decisions=useMemo(()=>selectSimulationDecisions(prepared.document.fragments),[prepared]),plans=rules.length?rules:decisions.map(c=>({id:c.id,condition:c.title,action:c.actions.map(a=>a.label).join(" / ")}));
 const canPrepare=plans.length>0||academicDraftIdeas(prepared.document.fragments).length>0;
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),gate=useRef(false),target=useRef<string|null>(null),mounted=useRef(true),controller=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 async function create(manual=false){if(gate.current)return;gate.current=true;setBusy(true);setError("");controller.current=new AbortController();try{await flushSaves();if(!mounted.current)return;const w=getWorkspace();if(!w)throw Error("Prepara primero tu PDF.");target.current??=w.revision===0?w.generationId:crypto.randomUUID();const r=await workspaceCommand(w.generationId,{action:"simulation",expectedRevision:w.revision,generationId:target.current,manual},controller.current.signal) as {snapshot:unknown};if(mounted.current){const s=parseWorkspaceSnapshot(r.snapshot);acceptWorkspace(s);router.push(`/simulacion?generation=${s.generation.id}`);}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:"No se pudo preparar la simulación.");}finally{gate.current=false;if(mounted.current)setBusy(false);}}
 return <section className={styles.preparation} data-simulation-preparation><h3>Del material a una decisión.</h3><p>Preparamos situaciones a partir de tu PDF. Solo se calificarán decisiones con un criterio de corrección verificable. Revisa y ajusta el borrador antes de compartirlo.</p>{plans.length?<><p className={styles.evidence}>{decisionCountLabel(plans.length)} con alternativas documentadas. {rules.length||decisions.every(p=>p.correctActionId)?"Evaluativa: nota de 0 a 100, feedback e intentos configurables en el editor.":"Exploratoria: no hay criterios suficientes para asignar una nota fiable."}</p><ol className={styles.candidateList}>{plans.map(r=><li key={r.id}><strong>{r.condition}</strong><span>{r.action}</span></li>)}</ol></>:<p className={styles.notice} role="status">{canPrepare?simulationAdvisory:"No hay contenido académico legible. Cambia el PDF o añade contenido docente."}</p>}<PipelineProgress steps={[{id:"conditions",label:plans.length?"Decisiones detectadas":"Ideas seleccionadas",status:canPrepare?"complete":"pending"},{id:"sources",label:"Fuentes verificadas",status:canPrepare?"complete":"pending"},{id:"build",label:"Preparando escenarios",status:error?"error":busy?"running":"pending",detail:error||undefined},{id:"review",label:"Revisión docente",status:"pending"}]}/><div className={styles.actions}><Button disabled={busy||!canPrepare} onClick={()=>create()}>Generar simulación</Button></div><details className={styles.manual}><summary>Definir un escenario docente</summary><p>Las situaciones y consecuencias añadidas se identificarán como contenido docente, sin atribuirlas automáticamente al PDF.</p><Button variant="secondary" disabled={busy} onClick={()=>create(true)}>Abrir borrador manual</Button></details>{error&&<p role="alert" className={styles.error}>{error}</p>}</section>;
}
