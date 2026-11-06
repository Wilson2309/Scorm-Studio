import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";
import {detectSimulationCases,type SimulationCasePlan,type CaseAction} from "./simulation-planning";
import {detectTimelines} from "./timeline-detection";
import {activityPresentation} from "./activity-presentation";
import {evidenceCoherence} from "./activity-knowledge";
import {overlap} from "./activity-evidence";

export type SimulationDecisionPlan={id:string;title:string;context:string;actions:CaseAction[];sourceFragmentIds:string[];criterion:string;correctActionId:string|null;casePlan?:SimulationCasePlan};
export const simulationRulePattern=()=>/\bSi\s+([^.!?;\n]{12,220}?),\s*(?:entonces\s+)([^.!?;\n]{8,220}?)[.;]\s*(?:de lo contrario|en caso contrario)\s*[,;:]?\s*([^.!?\n]{8,220})[.!?]?/gi;
export function sourceRuleAnswer(context:string,sources:SourceFragment[]){
 for(const f of sources)for(const m of f.text.matchAll(simulationRulePattern()))if(canonical(context).includes(canonical(m[1])))return canonical(m[2]);
 return null;
}
/** Source-backed decision candidates. Reading order and hypothetical outcomes are not rubrics. */
export function simulationDecisionPlans(sources:SourceFragment[]):SimulationDecisionPlan[]{
 const cases=detectSimulationCases(sources).map(plan=>{
  const first=plan.actions[0],matches=plan.actions.map(a=>overlap(plan.problem,a.evidence));
  const definite=/\b(?:garantiza|evita|reduce|resuelve|corrige|previene|restablece|asegura)\b/i.test(first.evidence)&&! /\b(?:podr[ií]a|posiblemente|tal vez)\b/i.test(first.evidence);
  const functionMatch=/\b(?:garantiza|evita|reduce|resuelve|corrige|previene|restablece|asegura)\s+(.+)/i.exec(first.evidence),objective=functionMatch?.[1];
  const supported=definite&&matches[0]>=1&&first.sourceFragmentIds.some(id=>plan.sourceFragmentIds.includes(id))&&!!objective&&plan.actions.slice(1).every(a=>overlap(objective,a.evidence)<overlap(objective,first.evidence));
  return {id:plan.caseId,title:"Intervenir ante un problema documentado",context:`Situación didáctica basada en el material: ${plan.problem}${supported?` Objetivo concreto de la intervención: ${objective}`:""} ¿Qué intervención aporta la función documentada para este objetivo?`,actions:plan.actions,sourceFragmentIds:plan.sourceFragmentIds,criterion:`La fuente atribuye a «${activityPresentation(first.label)}» esta función: ${activityPresentation(objective??first.evidence)}`,correctActionId:supported?first.id:null,casePlan:plan};
 });
 const sequences=detectTimelines(sources).candidates.filter(c=>c.mode==="PROCESS_TIMELINE"&&c.events.length>=3&&c.events.every((e,i)=>e.ordinal===i+1));
 const process:SimulationDecisionPlan[]=[];
 for(const sequence of sequences){
  const events=sequence.events;
  for(let i=1;i<Math.min(6,events.length);i++){
   const event=events[i],other=events[(i+1)%events.length],previous=events[i-1];
   if(canonical(event.description)===canonical(other.description))continue;
   const id=`sequence-${event.id}`,actions=[event,other].map(e=>({id:`choice-${e.id}`,label:activityPresentation(e.title),evidence:activityPresentation(e.description),sourceFragmentIds:e.sourceFragmentIds}));
   if(i%2)actions.reverse();
   process.push({id,title:`Decidir: ${activityPresentation(event.title)}`.slice(0,100),context:`Aplicación didáctica del procedimiento. La actuación completada fue: «${activityPresentation(previous.description)}». Debes decidir la actuación siguiente, respetando las dependencias del material. ¿Cuál corresponde ahora?`,actions,sourceFragmentIds:[...new Set([...event.sourceFragmentIds,...other.sourceFragmentIds,...previous.sourceFragmentIds])].slice(0,4),criterion:`La secuencia explícita sitúa «${activityPresentation(event.title)}» en la etapa ${event.ordinal}, después de «${activityPresentation(previous.title)}».`,correctActionId:`choice-${event.id}`});
  }
 }
 return [...cases,...process];
}
/** Keep a coherent educational neighborhood, without inventing causal links between cases. */
export function selectSimulationDecisions(sources:SourceFragment[]){
 const all=simulationDecisionPlans(sources);if(!all.length)return [];
 const passage=(p:SimulationDecisionPlan)=>({text:sources.filter(f=>p.sourceFragmentIds.includes(f.id)||p.actions.some(a=>a.sourceFragmentIds.includes(f.id))).map(f=>f.text).join(" "),heading:sources.find(f=>p.sourceFragmentIds.includes(f.id))?.sectionHeading??""});
 const anchor=all.find(p=>p.casePlan)??all[0],selected:SimulationDecisionPlan[]=[];let budget=2;
 for(const p of [anchor,...all.filter(p=>p!==anchor)]){
  if(selected.length>=5||budget+1+p.actions.length>20)break;
  if(selected.length&&!selected.some(s=>evidenceCoherence(passage(s),passage(p))))continue;
  if(selected.some(s=>canonical(s.context)===canonical(p.context)||s.actions.map(a=>canonical(a.label)).sort().join('|')===p.actions.map(a=>canonical(a.label)).sort().join('|')))continue;
  selected.push(p);budget+=1+p.actions.length;
 }
 return selected;
}
