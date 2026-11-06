import "server-only";
export class InsufficientAcademicContentError extends Error{
 constructor(){super("El PDF se pudo leer, pero no contiene suficiente información evaluable. Selecciona material explicativo o amplía el documento antes de preparar preguntas.");this.name="InsufficientAcademicContentError";}
}
import {normalizeDocument} from "./normalize";
import {terms,similarity} from "./quality-heuristics";
import {canonical} from "./text";
import {analysisSchema,type NormalizedDocument} from "./schema";
import {resolveSourceIds} from "./grounding";
import {hybridPreparedSchema,type HybridCandidate,type HybridRelation} from "./hybrid-schema";
import type {ExtractedDocument} from "../quiz/schema";

export function rankAcademicFragments(document:NormalizedDocument){
 const academic=document.fragments.filter(f=>f.contentType==="academic"),df=new Map<string,number>();
 for(const f of academic)for(const t of new Set(terms(f.normalizedText)))df.set(t,(df.get(t)??0)+1);
 const seen=new Set<string>();
 return [...document.fragments,...document.excluded].map((f,index)=>{
  const text=canonical(f.normalizedText),words=terms(text),unique=new Set(words),repeated=seen.has(text);seen.add(text);
  const signals={heading:/^[^\n:]{4,130}:|^\d+(?:\.\d+)+/.test(f.text)?3:0,hierarchy:/^\d+(?:\.\d+)+/.test(f.text)?1:0,
   definition:/\b(?:es|son|se define|consiste|constituye|representa)\b/.test(text)?2:0,process:/\b(?:proceso|etapas|pasos|mediante|metodologia|pruebas)\b/.test(text)?2:0,
   relationship:/\b(?:reduce|reducen|permite|permiten|incrementa|mejora|depende|garantiza)\b/.test(text)?2:0,comparison:/\b(?:mientras|diferencia|frente|versus|a diferencia)\b/.test(text)?2:0,
   list:/[:•]|^[-–]/m.test(f.text)?1:0,position:1/(1+index/Math.max(1,academic.length)),
   tfidf:Math.min(4,[...unique].reduce((sum,t)=>sum+Math.log(1+academic.length/(df.get(t)??1)),0)/Math.max(8,Math.sqrt(words.length)*4)),density:Math.min(2,unique.size/Math.max(1,words.length)*2),
   penalty:f.contentType!=="academic"?100:repeated?30:f.text.length<70?8:(f.text.match(/Depto\.|Facetas:|Ruta:/g)?.length??0)>=3?8:0};
  return {fragmentId:f.id,score:Math.round(Math.max(0,Object.entries(signals).reduce((n,[key,v])=>n+(key==="penalty"?-v:v),0))*100)/100,signals};
 }).sort((a,b)=>b.score-a.score||a.fragmentId.localeCompare(b.fragmentId));
}
export function detectSourceRelations(document:NormalizedDocument):HybridRelation[]{
 const relations:HybridRelation[]=[];
 const predicates:Record<string,HybridRelation["predicate"]>={mejora:"improves",mejoran:"improves",reduce:"reduces",reducen:"reduces",permite:"enables",permiten:"enables",causa:"causes",provoca:"causes","depende de":"depends_on","consiste en":"consists_of","se compone de":"consists_of","se diferencia de":"differs_from","se utiliza para":"used_for"};
 for(const f of document.fragments.filter(s=>s.contentType==="academic"))for(const sentence of f.normalizedText.split(/(?<=[.!?])\s+/)){
  const match=sentence.match(/\b(mejora[n]?|reduce[n]?|permite[n]?|causa|provoca|depende de|consiste en|se compone de|se diferencia de|se utiliza para)\b/i);if(!match)continue;
  const subject=sentence.slice(0,match.index).split(/[:;]/).at(-1)!.trim(),object=sentence.slice(match.index!+match[0].length).trim();
  if(subject.length<3||subject.length>160||object.length<4||object.length>240||sentence.length>600)continue;
  relations.push({id:`rel-${relations.length+1}`,subject,predicate:predicates[canonical(match[0])],object,text:sentence,sourceFragmentIds:[f.id]});
 }
 return relations.slice(0,200);
}
export function extractConceptCandidates(document:NormalizedDocument,ranking=rankAcademicFragments(document)):HybridCandidate[]{
 const candidates:HybridCandidate[]=[];
 const add=(raw:string,fragment:NormalizedDocument["fragments"][number],type:HybridCandidate["type"],bonus=0)=>{
  const name=raw.replace(/[*`]/g,"").replace(/^\d+(?:\.\d+)*\.?\s+/,"").replace(/^(?:La|El|Los|Las)\s+/i,"").replace(/\s+/g," ").trim();
  if(name.length<4||name.length>160||terms(name).length===0||!/[\p{L}]/u.test(name))return;
  if(/^(?:depto\.?|departamento|categoria)\s+[a-z]$/i.test(name))return;
  if((type==="concept"||type==="characteristic")&&terms(name).length<2)return;
  if(name.includes("(")&&!name.includes(")"))return;
  const previous=candidates.find(c=>canonical(c.name)===canonical(name));
  const score=(ranking.find(r=>r.fragmentId===fragment.id)?.score??0)+bonus;
  if(previous){if(previous.sourceFragmentIds.length<4&&!previous.sourceFragmentIds.includes(fragment.id)){previous.sourceFragmentIds.push(fragment.id);previous.pages=[...new Set([...previous.pages,fragment.page])];}previous.importanceScore=Math.max(previous.importanceScore,score);return;}
  candidates.push({id:`concept-${candidates.length+1}`,name,type,importanceScore:score,sourceFragmentIds:[fragment.id],section:fragment.sectionHeading,pages:[fragment.page]});
 };
 for(const f of document.fragments.filter(f=>f.contentType==="academic"&&f.text.length>=70)){
  const flat=f.normalizedText;
  for(const line of f.text.split('\n')){
   const h=line.match(/^([A-ZÁÉÍÓÚÑ][^:]{4,120}):/);if(h)add(h[1],f,/metod|prueba|sorting|testing/i.test(h[1])?"method":/proceso|checkout/i.test(h[1])?"process":/arquitect|jerarqu|navega/i.test(h[1])?"structure":"concept",4);
  }
  for(const m of flat.matchAll(/(?:[Mm]etodología de|pruebas de)\s+([A-Z][a-z-]+\s+[A-Z][a-z-]+)/g))add(m[1],f,"method",5);
  const subject=flat.match(/^(?:La |El |Los |Las )?([^:.;!?]{4,90}?)\s+(?:es|son|constituye|representa|transforma|producen|permite|favorece)\b/i);if(subject)add(subject[1],f,"definition",2);
  const first=f.text.split('\n')[0].trim();if(first.length>=6&&first.length<=95&&!/[.!?:]$/.test(first)&&!/[,:;]/.test(first)&&f.text.includes('\n')&&/^[A-ZÁÉÍÓÚÑ]/.test(first))add(first,f,/proceso|checkout|etapas/i.test(first)?"process":"characteristic",1);
 }
 return candidates.sort((a,b)=>b.importanceScore-a.importanceScore||a.id.localeCompare(b.id)).slice(0,240);
}
export function selectQuestionTargets(candidates:HybridCandidate[],count:number):HybridCandidate[]{
 const chosen:HybridCandidate[]=[];
 while(chosen.length<count){
  const pool=candidates.filter(c=>!chosen.some(s=>s.id===c.id||similarity(s.name,c.name)>.55||canonical(s.name).includes(canonical(c.name))||canonical(c.name).includes(canonical(s.name))));
  const ranked=pool.map(c=>({c,score:c.importanceScore+(chosen.some(s=>s.section===c.section)?0:3)+(chosen.some(s=>s.pages.some(p=>c.pages.includes(p)))?0:1)-chosen.filter(s=>s.sourceFragmentIds.some(id=>c.sourceFragmentIds.includes(id))).length*8})).sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id));
  if(!ranked.length)break;chosen.push(ranked[0].c);
 }
 return chosen;
}
export function analyzeDocumentDeterministically(extracted:ExtractedDocument){
 const started=performance.now(),document=normalizeDocument(extracted),ranking=rankAcademicFragments(document),candidates=extractConceptCandidates(document,ranking),relations=detectSourceRelations(document);
 const selected=selectQuestionTargets(candidates,32);
 if(!selected.length)throw new InsufficientAcademicContentError();
 const item=(id:string,text:string,ids:string[])=>({id,text:text.slice(0,600),sourceFragmentIds:ids.slice(0,4),sourceReferences:resolveSourceIds(ids.slice(0,4),document.fragments,document.documentId)});
 const title=document.name.replace(/\.pdf$/i,"").slice(0,160),refs=[...new Set(selected.flatMap(c=>c.sourceFragmentIds))].slice(0,40);
 const analysis=analysisSchema.parse({documentId:document.documentId,title,subject:"Candidatos académicos extraídos mediante reglas",unit:"",summary:`Preparación local del documento: ${document.fragments.length} fragmentos académicos y ${candidates.length} candidatos detectados. Los conceptos y relaciones son propuestas deterministas trazables, no comprensión semántica certificada. Revisa el material antes de evaluar.`,
  keyConcepts:selected.map(c=>item(c.id,c.name,c.sourceFragmentIds)),learningObjectives:selected.slice(0,24).map(c=>item(`goal-${c.id}`,`Interpretar y aplicar ${c.name} usando las evidencias del material.`,c.sourceFragmentIds)),
  sections:[...new Map(selected.map(c=>[c.section,c])).values()].slice(0,30).map((c,i)=>item(`section-${i+1}`,c.section.length>=3?c.section:`Contenido de página ${c.pages[0]}`,c.sourceFragmentIds)),
  importantFacts:selected.slice(0,10).map((c,i)=>item(`fact-${i+1}`,document.fragments.find(f=>f.id===c.sourceFragmentIds[0])!.text.slice(0,600),[c.sourceFragmentIds[0]])),relationships:relations.slice(0,24).map(r=>item(r.id,r.text,r.sourceFragmentIds)),excludedAdministrativeContent:[],sourceFragmentIds:refs,sourceReferences:resolveSourceIds(refs,document.fragments,document.documentId)});
 return hybridPreparedSchema.parse({method:"deterministic",document,analysis,candidates,ranking,relations,preprocessingMs:performance.now()-started});
}
