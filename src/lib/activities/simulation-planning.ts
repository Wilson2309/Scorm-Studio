import {z} from "zod";
import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";
import {evidenceTerms,overlap,rankActivityEvidence} from "./activity-evidence";
import {buildActivityKnowledge,evidenceCoherence} from "./activity-knowledge";
export type CaseAction={id:string;label:string;evidence:string;sourceFragmentIds:string[]};
export type SimulationCasePlan={caseId:string;problem:string;sourceFragmentIds:string[];actions:CaseAction[]};
const sentences=(text:string)=>text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/).map(s=>s.trim());
const remedy=/\b(?:garantiza|permite|evita|reduce|resuelve|asegura|corrige|previene|sincroniza|protege|restablece|disminuye)\b/i;
const functional=/\b(?:automatiza|centraliza|captura|almacena|procesa|consolida|unifica|permite|mejora|sustituye|monitorea|gestiona|integra|controla|reduce|disminuye|protege|previene|restablece|evita|facilita|compara|explica|representa|consiste|define)(?:n)?\b/i;
function interventions(text:string){
 const records:{label:string;evidence:string}[]=[];
 for(const sentence of sentences(text.replace(/^\d+[.)]\s*/,""))){
  const colons=[...sentence.matchAll(/:/g)];
  for(let i=0;i<colons.length;i++){
   const start=i?colons[i-1].index!+1:0,label=sentence.slice(start,colons[i].index).trim(),body=sentence.slice(colons[i].index!+1).trim(),evidence=sentences(body)[0];
   if(label.length>=8&&label.length<=130&&label.split(/\s+/).length<=12&&evidence.length>=45&&evidence.length<=600&&/[.!?]$/.test(evidence)&&functional.test(evidence))records.push({label,evidence});
  }
  if(!colons.length&&sentence.length<=600&&/[.!?]$/.test(sentence)){
   const verb=functional.exec(sentence),label=verb?sentence.slice(0,verb.index).trim():"";
   if(label.length>=8&&label.length<100&&label.split(/\s+/).length<=10)records.push({label,evidence:sentence});
  }
 }
 return records;
}
export function detectSimulationCases(sources:SourceFragment[]):SimulationCasePlan[]{
 const knowledge=buildActivityKnowledge(sources),eligible=new Set(knowledge.nodes.filter(n=>n.evidenceStatus!=="excluded").map(n=>n.id)),ranked=rankActivityEvidence(sources).filter(r=>eligible.has(r.source.id)),cases:SimulationCasePlan[]=[];
 for(const item of ranked.filter(r=>r.problem)){
  const parts=sentences(item.text),problem=parts.find(t=>/\b(?:cuando|problema|obst[aá]culo|por falta de|riesgo|fall[ao]|desincroniz\w*|dificultad|insuficiencia|p[eé]rdida|deterioro|escasez|anomal[ií]a|da[nñ]o|impide|no puede)\b/i.test(t)&&t.length>=45);
  if(!problem)continue;
  // A risk named in a taxonomy/list is not by itself an actual problem case.
  if(!/\b(?:cuando|presenta|sufre|enfrenta|experimenta|porque|debido a|por falta de|no puede|impide|provoca|causa|ocasiona|si)\b/i.test(problem))continue;
  if(problem.length>700)continue;
  const remedies=[item,...ranked.filter(r=>r!==item&&r.solution&&evidenceCoherence(item,r))].flatMap(r=>sentences(r.text).filter(t=>remedy.test(t)&&t!==problem&&t.length<=600&&/[.!?]$/.test(t)&&overlap(problem,t)>=1).map(text=>({text,source:r.source})));
  const chosen=remedies[0],solution=chosen?.text;if(!solution)continue;
  const subject=solution.split(remedy)[0].replace(/[,:;\s]+$/,"").trim();if(subject.length<8||subject.length>150)continue;
  const actions:CaseAction[]=[{id:`action-${chosen.source.id}`,label:subject,evidence:solution,sourceFragmentIds:[chosen.source.id]}];
  const candidates=ranked.flatMap(r=>interventions(r.text).map((entry,index)=>({r,...entry,index}))).flatMap(({r,label,evidence,index})=>{
   if(canonical(label)===canonical(subject)||evidence===problem||evidence===solution||!evidenceCoherence(item,r))return [];
   const terms=evidenceTerms(label),target=evidenceTerms(subject);if([...terms].filter(t=>target.has(t)).length/Math.max(1,terms.size)>.8)return [];
   const names=(s:string):string[]=>s.match(/\b[A-Z]{2,8}\b/g)??[];if(names(label).some(n=>names(subject).includes(n)))return [];
   return [{action:{id:`action-${r.source.id}${index?"-"+index:""}`,label,evidence,sourceFragmentIds:[r.source.id]},score:overlap(problem+solution,evidence)*4+r.score/20}];
  }).sort((a,b)=>b.score-a.score);
  for(const c of candidates){if(actions.length>=2)break;if(actions.some(a=>canonical(a.label)===canonical(c.action.label)))continue;actions.push(c.action);}
  if(actions.length>=2)cases.push({caseId:`case-${item.source.id}`,problem:problem.slice(0,700),sourceFragmentIds:[item.source.id],actions});
 }
 return cases.slice(0,3);
}
export const simulationCaseWordingSchema=z.object({caseId:z.string(),title:z.string().trim().min(8).max(100),scenario:z.string().trim().min(60).max(650),consequences:z.array(z.object({actionId:z.string(),interpretation:z.string().trim().min(25).max(500)}).strict()).min(2).max(3)}).strict();
export type SimulationCaseWording=z.infer<typeof simulationCaseWordingSchema>;
export const SIMULATION_CASE_TASK="Redacta UN caso educativo de decisión en español a partir del problema documentado y las intervenciones suministradas. Solo JSON: caseId exacto,title,scenario,consequences:[{actionId,interpretation}]. Incluye cada actionId una vez; no cambies ni inventes acciones. El escenario debe plantear el problema concreto y pedir elegir una intervención, no preguntar cómo estudiar. Cada interpretación compara cualitativamente el foco de esa intervención con el problema, apoyándose en su evidencia. No prometas resultados, cifras, hechos o riesgos nuevos. Las interpretaciones son inferencias didácticas para revisión docente, no hechos observados. No escribas HTML ni fechas ni puntuación. Escenario de 2 frases. Cada interpretación: una oración completa de 25 a 40 palabras, terminada con punto.";
export function validateCaseWording(input:unknown,plan:SimulationCasePlan){
 const result=simulationCaseWordingSchema.parse(input),ids=result.consequences.map(c=>c.actionId);
 if(result.caseId!==plan.caseId||ids.length!==plan.actions.length||new Set(ids).size!==ids.length||ids.some(id=>!plan.actions.some(a=>a.id===id)))throw Error("La redacción no conserva las decisiones y fuentes del caso preparado.");
 if(result.consequences.some(c=>!/[.!?]$/.test(c.interpretation)))throw Error("Una consecuencia está incompleta. No se ha aceptado la redacción truncada.");
 const evidence=plan.problem+" "+plan.actions.map(a=>a.evidence).join(" ");
 const prose=result.scenario+" "+result.consequences.map(c=>c.interpretation).join(" ");
 if(overlap(result.scenario,plan.problem)<3||result.consequences.some(c=>overlap(c.interpretation,evidence)<2)||[...prose.matchAll(/\b\d+(?:[.,]\d+)?\b/g)].some(m=>!evidence.includes(m[0])))throw Error("La redacción del caso no tiene apoyo suficiente en las evidencias suministradas.");
 if(evidenceTerms(result.scenario).size<8)throw Error("El escenario necesita una situación concreta, no una consigna genérica.");
 return result;
}
