import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";
import {simulationSpecSchema,type SimulationSpec,type SimulationIssue} from "./simulation-schema";
import {administrativeEvidence,relatedToEvidence} from "./activity-evidence";
import {evidenceCoherence} from "./activity-knowledge";
import {simulationDecisionPlans,sourceRuleAnswer} from "./simulation-decision-plan";
import {activityPresentation} from "./activity-presentation";
export function validateSimulation(input:unknown,sources:SourceFragment[],documentId?:string){
 const issues:SimulationIssue[]=[],add=(severity:SimulationIssue["severity"],code:string,message:string,eventId?:string)=>issues.push({severity,code,message,...(eventId?{eventId}:{})});
 const parsed=simulationSpecSchema.safeParse(input);if(!parsed.success){add("BLOCKING","structure","Completa título, instrucciones y entre 2 y 20 escenas con decisiones válidas.");return {valid:false,status:"BLOCKING" as const,issues};}
 const spec=parsed.data,byId=new Map(spec.scenes.map(s=>[s.id,s]));
 if(spec.preparation)add(spec.learningMode==="CONCEPT_EXPLORATION"?"INFO":"WARNING","document_suitability",spec.preparation.message);
 if(spec.learningMode==="CONCEPT_EXPLORATION"&&spec.configuration.scored)add("BLOCKING","exploration_grade","La exploración conceptual no evalúa decisiones. Desactiva la puntuación.");
 if(byId.size!==spec.scenes.length)add("BLOCKING","duplicate_scene","Cada escena necesita una identidad diferente.");
 if(documentId&&documentId!==spec.documentId)add("BLOCKING","document","Las fuentes no corresponden al documento de esta actividad.");
 if(!byId.has(spec.startSceneId))add("BLOCKING","start","Selecciona una escena inicial válida.");
 const decisionPatterns=new Set<string>();
 const plans=spec.scenes.some(s=>s.evaluation)?simulationDecisionPlans(sources):[],scenePatterns=new Set<string>();
 for(const s of spec.scenes){
  if(administrativeEvidence(s.title+"\n"+s.description))add("BLOCKING","administrative_content","La situación utiliza metadatos administrativos en lugar de contenido educativo.",s.id);
  if(s.kind==="DECISION"){
   const pattern=s.choices.map(c=>canonical(c.text)).sort().join("|");
   if(decisionPatterns.has(pattern))add("BLOCKING","repeated_decisions","Las mismas decisiones se repiten en situaciones distintas. Define alternativas específicas para este caso.",s.id);decisionPatterns.add(pattern);
   if(/c[oó]mo prefieres trabajarla|proponer una aplicaci[oó]n y contrastarla|explicar y utilizar esta idea/i.test(s.description+" "+s.choices.map(c=>c.text).join(" ")))add("BLOCKING","missing_situation","Esta es una consigna de estudio, no una situación de decisión. Define un problema concreto y alternativas pertinentes.",s.id);
   if(spec.configuration.scored){
    const positives=s.choices.filter(c=>c.points>0),maximum=Math.max(0,...s.choices.map(c=>c.points));
    if(maximum>0&&s.choices.every(c=>c.points===maximum))add("BLOCKING","indistinct_scores","Todas las alternativas conceden la misma nota. Define un criterio que diferencie las decisiones o utiliza exploración.",s.id);
    if(s.evaluation){
     const p=plans.find(p=>p.id===s.evaluation!.planId),correct=s.evaluation.correctChoiceIds,expected=p?.correctActionId;
     const required=p?[...new Set([...p.sourceFragmentIds,...p.actions.flatMap(a=>a.sourceFragmentIds)])].slice(0,4):[];
     if(!p||!expected||s.evaluation.criterion!==p.criterion||correct.length!==1||correct[0]!==expected||positives.length!==1||positives[0].id!==expected||s.choices.length!==p.actions.length||s.choices.some(c=>!p.actions.some(a=>a.id===c.id&&canonical(activityPresentation(a.label))===canonical(c.text)))||s.evaluation.sourceFragmentIds.slice().sort().join('|')!==required.slice().sort().join('|')||s.evaluation.sourceFragmentIds.some(id=>!s.sourceFragmentIds.includes(id)||!sources.some(f=>f.id===id&&f.documentId===spec.documentId&&f.contentType==='academic'))||s.provenance==='source'&&canonical(s.description)!==canonical(activityPresentation(p.context)))
      add("BLOCKING","unsupported_rubric","La puntuación no conserva el criterio y las alternativas respaldadas por la fuente. Revisa la decisión o desactiva la nota.",s.id);
    }else if(s.provenance!=="teacher"){
     const expected=sourceRuleAnswer(s.description,sources.filter(f=>s.sourceFragmentIds.includes(f.id)));
     if(!expected||positives.length!==1||canonical(positives[0].text)!==expected)add("BLOCKING","missing_evaluation_basis","Las opciones por sí solas no justifican una nota. Falta un criterio de corrección documental verificable.",s.id);
    }
   }
  }
  if(s.kind!=="ENDING"){const key=s.kind+canonical(s.description);if(scenePatterns.has(key))add("BLOCKING","repeated_scene","Dos escenas repiten el mismo contenido sin aportar otra decisión o consecuencia.",s.id);scenePatterns.add(key);}
  if(s.kind!=="ENDING"&&!(spec.learningMode==="CONCEPT_EXPLORATION"&&s.kind==="DECISION")&&s.provenance!=="teacher"&&s.sourceFragmentIds.length){const refs=sources.filter(f=>s.sourceFragmentIds.includes(f.id));if(!relatedToEvidence(s.description,refs))add("BLOCKING","unrelated_source","La situación no tiene suficiente relación con las fuentes citadas.",s.id);}
  if(/\b(?:de|del|para|mediante|con|y|en)\s*[.!?]?$/i.test(s.description))add("BLOCKING","incomplete_description","La descripción parece incompleta. Revisa la oración antes de compartir el caso.",s.id);
  if(s.provenance!=="teacher"&&!s.sourceFragmentIds.length)add("BLOCKING","missing_source","Esta escena automática necesita evidencia del PDF.",s.id);
  if(s.sourceFragmentIds.some(id=>!sources.some(f=>f.id===id&&f.documentId===spec.documentId&&f.contentType==="academic")))add("BLOCKING","source","Selecciona fuentes académicas de este documento.",s.id);
  if(s.provenance==="teacher")add("INFO","teacher","Contenido definido por el docente; contrasta sus consecuencias antes de compartir.",s.id);
  if(s.kind==="ENDING"&&s.choices.length||s.kind==="DECISION"&&s.choices.length<2||s.kind==="CONSEQUENCE"&&s.choices.length!==1)add("BLOCKING","choices","Un final no tiene salidas; una decisión necesita 2–4 opciones y una consecuencia una continuación.",s.id);
  if(new Set(s.choices.map(c=>c.id)).size!==s.choices.length||new Set(s.choices.map(c=>canonical(c.text))).size!==s.choices.length)add("BLOCKING","duplicates","Distingue las opciones repetidas de esta escena.",s.id);
  for(const c of s.choices)if(!byId.has(c.nextSceneId))add("BLOCKING","destination","Hay una decisión sin escena de destino válida.",s.id);
  if(s.kind!=="DECISION"&&s.choices.some(c=>c.points!==0))add("BLOCKING","score","Solo una decisión evaluativa puede conceder puntos.",s.id);
  if(spec.configuration.scored&&s.kind==="DECISION"&&Math.max(...s.choices.map(c=>c.points),0)===0)add("BLOCKING","rubric","Define una puntuación positiva para evaluar esta decisión o desactiva la nota.",s.id);
  if(s.description.length<35)add("WARNING","brief","Amplía la situación para que la decisión tenga contexto suficiente.",s.id);
  if(s.kind==='CONSEQUENCE'&&s.provenance==='source'){
   const evidence=sources.filter(f=>s.sourceFragmentIds.includes(f.id)).map(f=>f.text).join(' ');
   if([...s.description.matchAll(/\b\d+(?:[.,]\d+)?\s*%/g)].some(m=>!evidence.includes(m[0])))add("BLOCKING","invented_outcome","La consecuencia contiene una cifra porcentual que no aparece en sus fuentes.",s.id);
  }
 }
 const reachable=new Set<string>(),active=new Set<string>();let cycle=false;
 function visit(id:string){if(active.has(id)){cycle=true;return;}if(reachable.has(id))return;const s=byId.get(id);if(!s)return;reachable.add(id);active.add(id);s.choices.forEach(c=>visit(c.nextSceneId));active.delete(id);}visit(spec.startSceneId);
 if(reachable.size<spec.scenes.length)add("WARNING","unreachable","Hay escenas que no se alcanzan desde el inicio. Revisa las conexiones.");
 const endings=new Set(spec.scenes.filter(s=>s.kind==="ENDING").map(s=>s.id));let canEnd=new Set(endings);for(let i=0;i<spec.scenes.length;i++){const next=new Set(canEnd);for(const s of spec.scenes)if(s.choices.some(c=>canEnd.has(c.nextSceneId)))next.add(s.id);canEnd=next;}
 if(!endings.size||[...reachable].some(id=>!canEnd.has(id)))add("BLOCKING","dead_end","Todas las rutas alcanzables necesitan una salida hacia un final.");
 const distance=new Map([...endings].map(id=>[id,0]));for(let i=0;i<spec.scenes.length;i++)for(const s of spec.scenes){const options=s.choices.map(c=>distance.get(c.nextSceneId)).filter((n):n is number=>n!==undefined);if(options.length){const n=Math.min(...options)+1;if(n<(distance.get(s.id)??Infinity))distance.set(s.id,n);}}
 if((distance.get(spec.startSceneId)??Infinity)>spec.configuration.maxSteps)add("BLOCKING","step_budget","El límite de pasos no permite alcanzar un final. Auméntalo o simplifica el recorrido.");
 if(cycle)add(spec.learningMode==="CONCEPT_EXPLORATION"?"INFO":"WARNING","cycle",spec.learningMode==="CONCEPT_EXPLORATION"?"Puedes volver al menú para explorar otros conceptos; este recorrido no concede puntos.":"Existe un ciclo: cada decisión solo puntúa la primera vez y el recorrido tiene un límite de pasos.");
 if(spec.learningMode==="CONCEPT_EXPLORATION"){
  const refs=sources.filter(f=>spec.scenes.some(s=>s.sourceFragmentIds.includes(f.id))),connected=new Set(refs.length?[refs[0].id]:[]);for(let pass=0;pass<refs.length;pass++)for(const f of refs)if(refs.some(other=>connected.has(other.id)&&evidenceCoherence({text:f.text,heading:f.sectionHeading},{text:other.text,heading:other.sectionHeading})))connected.add(f.id);
  if(refs.length>1&&connected.size!==refs.length)add("BLOCKING","disconnected_topics","Las fuentes seleccionadas no forman un conjunto conceptual coherente.");
 }
 if(spec.configuration.scored){const withoutDecision=new Set<string>(),queue=[spec.startSceneId];while(queue.length){const id=queue.pop()!;if(withoutDecision.has(id))continue;withoutDecision.add(id);const s=byId.get(id);if(!s||s.kind==="DECISION")continue;if(s.kind==="ENDING")add("BLOCKING","unassessed_path","Una ruta termina sin decisiones evaluables. Ajusta las conexiones o usa exploración sin nota.");else queue.push(...s.choices.map(c=>c.nextSceneId));}}
 if(spec.configuration.scored){
  const queue=[{id:spec.startSceneId,steps:0,graded:0}],seen=new Set<string>();let attainable=false,checks=0;
  while(queue.length&&checks++<10000){const v=queue.shift()!,key=v.id+':'+v.graded;if(seen.has(key)||v.steps>spec.configuration.maxSteps)continue;seen.add(key);const sceneIndex=spec.scenes.findIndex(s=>s.id===v.id),s=byId.get(v.id);if(!s)continue;if(s.kind==='ENDING'){if(v.graded)attainable=true;continue;}const bit=1<<sceneIndex,already=!!(v.graded&bit),best=Math.max(0,...s.choices.map(c=>c.points));for(const c of s.choices)if(s.kind!=='DECISION'||already||c.points===best)queue.push({id:c.nextSceneId,steps:v.steps+1,graded:s.kind==='DECISION'&&best>0?v.graded|bit:v.graded});}
  if(!attainable)add('BLOCKING','unreachable_maximum','No existe una ruta que alcance un final tomando las decisiones de máxima puntuación. Revisa conexiones y límite de pasos.');
 }
 const valid=!issues.some(i=>i.severity==="BLOCKING");return {valid,status:valid?issues.some(i=>i.severity==="WARNING")?"WARNING" as const:"PASS" as const:"BLOCKING" as const,issues};
}
export function simulationModel(spec:SimulationSpec){return {start:spec.scenes.findIndex(s=>s.id===spec.startSceneId),scored:spec.configuration.scored,passingScore:spec.configuration.passingScore,maxSteps:spec.configuration.maxSteps,allowRetry:spec.configuration.allowRetry,maxAttempts:spec.configuration.maxAttempts,scenes:spec.scenes.map(s=>({kind:s.kind,choices:s.choices.map(c=>({next:spec.scenes.findIndex(n=>n.id===c.nextSceneId),points:c.points}))}))};}
