import type {ContentIntelligenceProvider} from "../content/provider-contract";
import type {SourceFragment} from "../content/schema";
import type {SimulationSpec,SimulationScene} from "./simulation-schema";
import {detectSimulationCases,validateCaseWording,type SimulationCasePlan,type SimulationCaseWording} from "./simulation-planning";
import {selectSimulationDecisions,type SimulationDecisionPlan} from "./simulation-decision-plan";
import {activityPresentation} from "./activity-presentation";

export function assembleSimulationDecisions(plans:SimulationDecisionPlan[],documentId:string,id:string,title:string,wording?:SimulationCaseWording):SimulationSpec{
 if(!plans.length)throw Error("No hay decisiones fundamentadas suficientes.");
 const scored=plans.every(p=>p.correctActionId!==null),scenes:SimulationScene[]=[],decisionId=(i:number)=>i===0?"case-decision":`case-decision-${i}`;
 plans.forEach((p,i)=>{
  const copy=i===0&&p.casePlan&&wording?validateCaseWording(wording,p.casePlan):null,refs=[...new Set([...p.sourceFragmentIds,...p.actions.flatMap(a=>a.sourceFragmentIds)])].slice(0,4);
  scenes.push({id:decisionId(i),title:activityPresentation(copy?.title??p.title),description:activityPresentation(copy?.scenario??p.context),kind:"DECISION",sourceFragmentIds:refs,provenance:"source",evaluation:{planId:p.id,criterion:p.criterion,correctChoiceIds:p.correctActionId?[p.correctActionId]:[],sourceFragmentIds:refs},choices:p.actions.map((a,j)=>({id:a.id,text:activityPresentation(a.label),nextSceneId:`case-consequence-${i}-${j}`,feedback:activityPresentation(scored?`${a.id===p.correctActionId?"Elección alineada":"Elección por revisar"}. ${p.criterion}`:`Hecho documentado: ${a.evidence}`),points:scored&&a.id===p.correctActionId?1:0}))});
  p.actions.forEach((a,j)=>{
   const correct=a.id===p.correctActionId,next=i<plans.length-1?decisionId(i+1):(p.correctActionId?correct:j===0)?"case-ending":"case-review-ending",interpretation=copy?.consequences.find(c=>c.actionId===a.id)?.interpretation;
   const criterion=`Hecho documentado · criterio: ${p.criterion}`,note="La aplicación a este ejercicio es didáctica; no afirma un resultado operativo observado.",description=scored?(correct?`${criterion}\n\nLa elección respeta ese criterio. ${note}`:`Hecho documentado sobre la opción elegida: ${a.evidence}\n\n${criterion}\n\nLa elección no corresponde al objetivo fijado. ${note}`):`Hecho documentado: ${a.evidence}\n\n${interpretation?`Inferencia didáctica para revisión: ${interpretation}`:"Aplicación didáctica: compara esta función con el objetivo del caso. La fuente no documenta un resultado observado de tu elección."}`;
   scenes.push({id:`case-consequence-${i}-${j}`,title:correct?"Actuación contrastada con la fuente":"Alcance y límites de la elección",description:activityPresentation(description.length<=1200?description:`${criterion}\n\nLa función de «${a.label}» puede contrastarse en la fuente. ${note}`),kind:"CONSEQUENCE",sourceFragmentIds:refs,provenance:"source",choices:[{id:`continue-${i}-${j}`,text:i<plans.length-1?"Continuar con la siguiente situación":"Consultar el resultado",nextSceneId:next,feedback:i<plans.length-1?"La siguiente situación utiliza su propia evidencia; no supone efectos inventados de esta decisión.":"Consulta las decisiones evaluadas y su retroalimentación.",points:0}]});
  });
 });
 const refs=[...new Set(plans.flatMap(p=>p.sourceFragmentIds))].slice(0,4);
 for(const [id,lastAligned] of [["case-ending",true],["case-review-ending",false]] as const)scenes.push({id,title:scored?(lastAligned?"Cierre con la última elección fundamentada":"Cierre con la última elección por revisar"):`Cierre de la intervención ${lastAligned?1:2}`,description:scored?`Has completado las situaciones del material. Tu última elección ${lastAligned?"se alinea con":"necesita revisión frente a"} su criterio. La nota resume todas las decisiones del recorrido, no solo esta última.`:"Has contrastado las intervenciones con sus fuentes. Este recorrido es exploratorio: no documenta resultados observados ni asigna una nota académica.",kind:"ENDING",choices:[],sourceFragmentIds:refs,provenance:"source"});
 return {id,type:"SIMULATION",schemaVersion:1,documentId,title:title.slice(0,100),learningMode:"DECISION_SCENARIO",description:scored?"Situaciones didácticas conectadas con criterios verificables del material y retroalimentación específica.":"Situaciones del material para comparar intervenciones sin atribuir una corrección no fundamentada.",instructions:scored?"Lee cada situación, decide y contrasta el criterio y la fuente. La nota de 0 a 100 procede de tus decisiones, no de visitar escenas.":"Contrasta las alternativas con las fuentes. Las inferencias didácticas requieren revisión docente y no reciben calificación.",...(scored?{}:{preparation:{level:"partial" as const,message:"No todas las decisiones tienen un criterio inequívoco de corrección. Se conserva el recorrido sin nota; revisa las fuentes y define una rúbrica docente antes de evaluar."}}),startSceneId:decisionId(0),scenes,configuration:{scored,passingScore:70,maxSteps:Math.min(60,Math.max(12,scenes.length*2)),allowRetry:true,maxAttempts:2}};
}

/** The application owns identities, sources, connections and assessment. AI writes content only. */
export function assembleSimulationCase(plan:SimulationCasePlan,documentId:string,id:string,title:string,wording?:SimulationCaseWording):SimulationSpec{
 const copy=wording?validateCaseWording(wording,plan):null,allRefs=[...new Set([...plan.sourceFragmentIds,...plan.actions.flatMap(a=>a.sourceFragmentIds)])].slice(0,4);
 const scenes:SimulationScene[]=[{id:"case-decision",title:copy?.title??"Una intervención para el problema documentado",description:copy?.scenario??`${plan.problem} ¿Qué intervención elegirías para atender esta situación? Contrasta el alcance de las alternativas antes de decidir.`,kind:"DECISION",sourceFragmentIds:allRefs,provenance:"source",choices:plan.actions.map((a,i)=>({id:a.id,text:a.label,nextSceneId:`case-consequence-${i}`,feedback:`Hecho documentado: ${a.evidence}`.slice(0,700),points:0}))}];
 plan.actions.forEach((a,i)=>scenes.push({id:`case-consequence-${i}`,title:`Alcance de la intervención ${i+1}`,description:`Hecho documentado: ${a.evidence}\n\n${copy?"Inferencia didáctica (revisión docente): "+copy.consequences.find(c=>c.actionId===a.id)!.interpretation:"Reflexión docente: compara el alcance de esta intervención con el problema. El material no registra un resultado observado de esta elección en el caso."}`.slice(0,1200),kind:"CONSEQUENCE",sourceFragmentIds:[...new Set([...a.sourceFragmentIds,...plan.sourceFragmentIds])],provenance:"source",choices:[{id:`continue-${i}`,text:"Concluir la decisión",nextSceneId:"case-ending",feedback:"Distingue lo que afirma el material de tu interpretación de la situación.",points:0}]}));
 scenes.push({id:"case-ending",title:"Decisión contrastada con la evidencia",description:"Has comparado intervenciones del material frente a un problema concreto. Revisa qué parte de tu razonamiento está documentada y qué parte es una aplicación didáctica. Este borrador no asigna una calificación automática.",kind:"ENDING",choices:[],sourceFragmentIds:allRefs,provenance:"source"});
 return {id,type:"SIMULATION",schemaVersion:1,documentId,title:title.slice(0,100),description:"Caso de decisión basado en un problema y enfoques tecnológicos documentados.",instructions:"Lee el caso, elige una intervención y contrasta su alcance con las fuentes. Distingue los hechos documentados de las inferencias didácticas.",preparation:{level:"partial",message:"El caso usa un problema y alternativas del PDF. Las consecuencias cualitativas son aplicaciones didácticas señaladas para revisión docente; no resultados observados ni una rúbrica automática."},startSceneId:"case-decision",scenes,configuration:{scored:false,passingScore:70,maxSteps:12,allowRetry:true,maxAttempts:2}};
}
export async function writeSimulationCase(sources:SourceFragment[],documentId:string,id:string,title:string,provider:ContentIntelligenceProvider){
 const decisions=selectSimulationDecisions(sources);
 if(decisions.length){
  // Deterministic evidence is sufficient for source-order/source-function decisions.
  // Only an unassessed case that needs wording uses the existing one compact request.
  if(decisions.every(p=>p.correctActionId)||!provider.generateSimulationCase||!decisions[0].casePlan)return assembleSimulationDecisions(decisions,documentId,id,title);
  const copy=await provider.generateSimulationCase(decisions[0].casePlan);return assembleSimulationDecisions(decisions,documentId,id,title,validateCaseWording(copy,decisions[0].casePlan));
 }
 const plan=detectSimulationCases(sources)[0];if(!plan)throw Error("No hay un caso suficientemente fundamentado para redactar.");
 if(!provider.generateSimulationCase)return assembleSimulationCase(plan,documentId,id,title);
 // Exactly one request; malformed content is rejected, never repaired in a loop.
 const result=await provider.generateSimulationCase(plan);
 return assembleSimulationCase(plan,documentId,id,title,validateCaseWording(result,plan));
}
