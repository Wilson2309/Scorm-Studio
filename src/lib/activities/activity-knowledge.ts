import {z} from "zod";
import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";
import {administrativeEvidence,activityText,evidenceHeading,evidenceTerms,overlap,rankActivityEvidence} from "./activity-evidence";

export const knowledgeKindSchema=z.enum(["concept","definition","fact","dated_event","process","stage","dependency","cause_effect","problem_solution","decision","case","comparison","quantitative","administrative","bibliographic"]);
const knowledgeNodeSchema=z.object({id:z.string(),page:z.number().int().positive(),heading:z.string(),text:z.string(),sourceFragmentIds:z.array(z.string()).min(1),kinds:z.array(knowledgeKindSchema),score:z.number(),evidenceStatus:z.enum(["explicit","candidate","excluded"])}).strict();
export const activityKnowledgeSchema=z.object({nodes:z.array(knowledgeNodeSchema),relations:z.array(z.object({subject:z.string(),predicate:z.enum(["causes","reduces","enables","depends_on","precedes","differs_from"]),object:z.string(),sourceFragmentIds:z.array(z.string()).min(1),evidenceText:z.string()}).strict()),coverage:z.array(z.object({page:z.number(),indexed:z.number(),academic:z.number(),excluded:z.number()}))}).strict();
export type ActivityKnowledge=z.infer<typeof activityKnowledgeSchema>;

/** Candidate classification, not a claim of complete semantic understanding. */
export function buildActivityKnowledge(sources:SourceFragment[]):ActivityKnowledge{
 const ranking=new Map(rankActivityEvidence(sources).map(r=>[r.source.id,r])),relations:ActivityKnowledge["relations"]=[];
 const nodes=sources.map(f=>{
  const raw=f.text,text=activityText(f),kinds:z.infer<typeof knowledgeKindSchema>[]=[],bibliographic=/^(?:bibliograf[ií]a|referencias bibliogr[aá]ficas|references)\b/i.test(raw)||/^\S.{0,70}\(\d{4}\)\.[^\n]*(?:https?:|doi\b)/i.test(raw);
  if(bibliographic)kinds.push("bibliographic");if(f.contentType!=="academic"||administrativeEvidence(raw))kinds.push("administrative");
  if(!kinds.length){
   kinds.push("fact");if(/\b(?:se define|consiste en|se denomina|se entiende por|es un[ao]?|son (?:los|las|unos|unas))\b/i.test(text))kinds.push("concept","definition");
   if(/\b(?:[12]\d{3}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(text))kinds.push("dated_event");
   if(/\b(?:procedimiento|proceso|etapas?|fases?|pasos?|secuenciales?|primero|finalmente)\b/i.test(text))kinds.push("process");
   if(/(?:\(\d+\)|\b(?:paso|etapa|fase)\s+\d+)/i.test(text))kinds.push("stage");
   if(/\b(?:depende de|requiere|antes de|despu[eé]s de|precede a)\b/i.test(text))kinds.push("dependency");
   if(/\b(?:causa|provoca|produce|reduce|evita|permite|debido a|por tanto|en consecuencia)\b/i.test(text))kinds.push("cause_effect");
   const r=ranking.get(f.id);if(r?.problem)kinds.push("case");if(r?.problem&&r.solution)kinds.push("problem_solution");
   if(/\b(?:alternativa|opci[oó]n|elegir|seleccionar|si .+ entonces|en caso contrario)\b/i.test(text))kinds.push("decision");
   if(/\b(?:por ejemplo|caso pr[aá]ctico|situaci[oó]n|cuando)\b/i.test(text))kinds.push("case");
   if(/\b(?:a diferencia|mientras que|en cambio|comparad[oa]|frente a)\b/i.test(text))kinds.push("comparison");
   if(/\d\s*(?:%|mg|kg|cm|mm|km|°|unidades|veces)|\b(?:promedio|porcentaje|tasa de)\b/i.test(text))kinds.push("quantitative");
   const predicates:{pattern:RegExp;name:ActivityKnowledge["relations"][number]["predicate"]}[]=[{pattern:/\b(?:causa|provoca|produce)\b/gi,name:"causes"},{pattern:/\b(?:reduce|evita|disminuye)\b/gi,name:"reduces"},{pattern:/\b(?:permite|habilita|facilita)\b/gi,name:"enables"},{pattern:/\b(?:depende de|requiere)\b/gi,name:"depends_on"},{pattern:/\bprecede a\b/gi,name:"precedes"},{pattern:/\ba diferencia de\b/gi,name:"differs_from"}];
   for(const p of predicates)for(const m of text.matchAll(p.pattern)){const left=text.slice(0,m.index).split(/[.!?;]/).at(-1)!.trim(),right=text.slice(m.index!+m[0].length).split(/[.!?;]/)[0].trim();if(left.length>=8&&right.length>=8)relations.push({subject:left.slice(-200),predicate:p.name,object:right.slice(0,300),sourceFragmentIds:[f.id],evidenceText:left+" "+m[0]+" "+right});}
  }
  const excluded=kinds.includes("administrative")||kinds.includes("bibliographic");return {id:f.id,page:f.page,heading:evidenceHeading(f),text:excluded?raw:text,sourceFragmentIds:[f.id],kinds:[...new Set(kinds)],score:excluded?-100:ranking.get(f.id)?.score??0,evidenceStatus:excluded?"excluded" as const:ranking.has(f.id)?"explicit" as const:"candidate" as const};
 });
 return activityKnowledgeSchema.parse({nodes,relations,coverage:[...new Set(sources.map(f=>f.page))].sort((a,b)=>a-b).map(page=>({page,indexed:nodes.filter(n=>n.page===page).length,academic:nodes.filter(n=>n.page===page&&n.evidenceStatus!=="excluded").length,excluded:nodes.filter(n=>n.page===page&&n.evidenceStatus==="excluded").length}))});
}
export function evidenceCoherence(a:{text:string;heading:string},b:{text:string;heading:string}){
 const heading=canonical(a.heading),meaningful=heading.length>15&&!/^(?:contenido|material|unidad \d+|crecimiento de|recursos|presencial)$/.test(heading)&&!/(?:\bde|\by|\ben)$/.test(heading);
 // Candidate neighborhoods may share inflections or short technical identifiers.
 // This is a relevance signal, never proof of a causal relationship.
 const vocabulary=(text:string)=>new Set([...evidenceTerms(text)].map(w=>w.length>=8?w.slice(0,7):w.replace(/s$/,"")));
 const left=vocabulary(a.text),right=vocabulary(b.text),shared=[...left].filter(w=>right.has(w)).length,names=(s:string):string[]=>s.match(/\b[A-Z]{2,8}\b/g)??[],technical=names(a.text).some(n=>names(b.text).includes(n));
 return overlap(a.text,b.text)>=2||shared>=2||shared>=1&&technical||meaningful&&heading===canonical(b.heading);
}
/** Select a coherent neighborhood, not the first N fragments or arbitrary page quotas. */
export function selectCoherentEvidence(sources:SourceFragment[],limit=8){
 const ranked=rankActivityEvidence(sources);if(!ranked.length)return [];
 const groups=ranked.slice(0,20).map(anchor=>{const selected=[anchor];for(const candidate of ranked){if(selected.length>=limit)break;if(candidate===anchor||!selected.some(s=>evidenceCoherence(s,candidate)))continue;const terms=evidenceTerms(candidate.text);if(selected.some(s=>{const other=evidenceTerms(s.text);return [...terms].filter(t=>other.has(t)).length/Math.max(1,Math.min(terms.size,other.size))>.9;}))continue;selected.push(candidate);}return selected;});
 groups.sort((a,b)=>b.reduce((sum,r)=>sum+r.score,0)-a.reduce((sum,r)=>sum+r.score,0));return groups[0];
}
export function conceptTitle(text:string){
 const flat=text.replace(/\s+/g," ").trim(),match=/^(.{5,90}?)\s+(?:se define|consiste en|se denomina|es un[ao]?|son (?:los|las))\b/i.exec(flat),colon=flat.indexOf(":");
 const title=match?.[1]??(colon>5&&colon<85?flat.slice(0,colon):flat.split(/[.!?;]/)[0].split(/\s+/).slice(0,10).join(" "));
 return title.replace(/(?:\s+(?:de|del|en|para|y|con|el|la|los|las|un|una))+$/i,"").slice(0,100);
}
