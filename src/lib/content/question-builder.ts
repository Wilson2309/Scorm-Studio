import type {BlueprintSlot,DocumentAnalysis,SourceFragment} from "./schema";
import {canonical} from "./text";
import {terms,similarity,isAdministrativeQuestion} from "./quality-heuristics";

export type ConceptPoolItem={id:string;label:string;category:"concept"|"method"|"structure"|"process"|"outcome"|"related-term";sourceFragmentIds:string[]};
export const COGNITIVE_TEMPLATES={
  remember:"Reconocimiento factual: identificar un dato o concepto explícito. No presentarlo como razonamiento.",
  comprehension:"Distinción conceptual: contrastar dos interpretaciones próximas y explicar cuál relación coincide con la fuente.",
  application:"Caso breve: una entidad tiene un problema concreto y una restricción; elegir cómo usar el concepto para resolverlo. Alternativas: aplicaciones cercanas pero inadecuadas para esa restricción.",
  analysis:"Caso de 2 frases con al menos dos factores relevantes en tensión (síntomas, restricciones o resultados distintos). Pedir diagnóstico causal, comparación de alternativas o consecuencia razonada. La respuesta debe conectar ambos factores; mencionar el nombre de una técnica no basta.",
} as const;
export type ConstructionGuide={questionId:string;style:"distinction"|"scenario"|"application"|"comparison"|"diagnosis"|"recognition";template:string;alternatives:ConceptPoolItem[]};
const category=(text:string):ConceptPoolItem["category"]=>/metod|tecnic|prueba|testing|sorting/.test(canonical(text))?"method":/estructura|jerarqui|arquitectura|taxonom|navegacion/.test(canonical(text))?"structure":/proceso|checkout|flujo|etapa/.test(canonical(text))?"process":/reduc|aument|mejor|conversion|resultado|estabilidad/.test(canonical(text))?"outcome":"related-term";

/** Labels come from grounded analysis or literal PDF phrases, never a domain dictionary. */
export function buildConceptPool(analysis:DocumentAnalysis,sources:SourceFragment[]):ConceptPoolItem[]{
  const excluded=new Set(analysis.excludedAdministrativeContent.map(e=>e.fragmentId));
  const usable=sources.filter(f=>f.documentId===analysis.documentId&&f.contentType==="academic"&&!excluded.has(f.id));
  const pool:ConceptPoolItem[]=[];
  function add(label:string,ids:string[],kind?:ConceptPoolItem["category"]){
    label=label.replace(/[*`]/g,"").replace(/\s+/g," ").trim().replace(/^[\d.\s]+/,"");
    const refs=[...new Set(ids)].filter(id=>usable.some(f=>f.id===id));
    if(!refs.length||label.length<4||label.length>180||!terms(label).length||(!kind&&label.split(" ").length===1&&label.length<6)||isAdministrativeQuestion(`Qué ${label}`)||/universidad|dossier|docente|sede|contacto|carga horaria/i.test(label))return;
    const old=pool.find(item=>canonical(item.label)===canonical(label));
    if(old){old.sourceFragmentIds=[...new Set([...old.sourceFragmentIds,...refs])].slice(0,4);return;}
    pool.push({id:`term-${pool.length+1}`,label,category:kind??category(label),sourceFragmentIds:refs.slice(0,4)});
  }
  for(const c of analysis.keyConcepts)add(c.text,c.sourceFragmentIds,"concept");
  for(const f of [...analysis.importantFacts,...analysis.relationships])add(f.text,f.sourceFragmentIds);
  for(const f of usable){
    // Headings before ':' and short parenthetical terms are useful alternatives.
    for(const line of f.text.split(/\n/)){
      const heading=line.match(/^([A-ZÁÉÍÓÚÑ][^:]{4,99}):/);if(heading&&!(heading[1].includes("(")&&!heading[1].includes(")")))add(heading[1],[f.id]);
    }
    for(const match of f.text.matchAll(/\(([^()]{4,65})\)/g))if(!/\d|ej\.|figura|et al|^(?:en |regulados|como |por )/i.test(match[1].trim()))add(match[1],[f.id]);
    // Named techniques and explicit enumerations survive PDF wrapping. Avoid
    // arbitrary capitalized runs that mix headings with the following sentence.
    const flat=f.text.replace(/\s+/g," ");
    for(const match of flat.matchAll(/(?:pruebas de|metodología de|mediante pruebas de)\s+([A-Z][a-z-]+\s+[A-Z][a-z-]+)/g))add(match[1],[f.id],"method");
    for(const match of flat.matchAll(/(?:aplican|incluyen|utilizan)\s+([^.!?]{10,300})/gi))for(const part of match[1].split(/,| y (?=recordatorios|opcion|validacion|validación)/))if(part.trim().length<100)add(part,[f.id],"process");
  }
  // Bound after scanning every page; earlier pages must not exhaust the pool.
  return pool.length<=240?pool:Array.from({length:240},(_,i)=>pool[Math.floor(i*pool.length/240)]);
}
export function buildConstructionGuides(slots:BlueprintSlot[],pool:ConceptPoolItem[],sources:SourceFragment[]):ConstructionGuide[]{
  return slots.map(slot=>{
    const anchors=sources.filter(f=>slot.allowedSourceFragmentIds.includes(f.id));
    const context=anchors.map(f=>f.normalizedText).join(" "),domain=new Set(terms(slot.targetConcept+" "+context));
    const ranked=pool.filter(item=>!canonical(slot.targetConcept).includes(canonical(item.label))&&similarity(item.label,slot.targetConcept)<.7).map(item=>{
      const itemSources=sources.filter(f=>item.sourceFragmentIds.includes(f.id));
      const sameSource=item.sourceFragmentIds.some(id=>slot.allowedSourceFragmentIds.includes(id));
      const sameSection=itemSources.some(f=>anchors.some(a=>a.page===f.page&&a.sectionHeading&&a.sectionHeading===f.sectionHeading));
      const overlap=terms(item.label).filter(w=>domain.has(w)).length;
      const specificity=item.label.split(" ").length>14?-2:item.category==="method"||item.category==="structure"?2:0;
      return {item,score:(sameSource?4:0)+(sameSection?3:0)+Math.min(3,overlap)+specificity,related:sameSource||sameSection||overlap>=2};
    }).filter(x=>x.related).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));
    const alternatives:ConceptPoolItem[]=[];
    for(const {item} of ranked){if(!alternatives.some(other=>similarity(other.label,item.label)>.65||canonical(other.label).includes(canonical(item.label))||canonical(item.label).includes(canonical(other.label))))alternatives.push(item);if(alternatives.length===3)break;}
    const style=slot.cognitiveLevel==="analysis"?(slot.perspective==="compare"?"comparison":"diagnosis"):slot.cognitiveLevel==="application"?(slot.slot%2?"application":"scenario"):slot.cognitiveLevel==="remember"?"recognition":"distinction";
    return {questionId:slot.questionId,style,template:COGNITIVE_TEMPLATES[slot.cognitiveLevel],alternatives};
  });
}
