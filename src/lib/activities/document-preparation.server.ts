import "server-only";
import type {ExtractedDocument} from "../quiz/schema";
import {analyzeDocumentDeterministically,InsufficientAcademicContentError,rankAcademicFragments,detectSourceRelations} from "../content/deterministic-analysis.server";
import {normalizeDocument} from "../content/normalize";
import {hybridPreparedSchema} from "../content/hybrid-schema";
import {resolveSourceIds} from "../content/grounding";
import {analysisSchema} from "../content/schema";
import {detectTimelines} from "./timeline-detection";
import {academicDraftIdeas} from "./draft-suitability";
import {detectSimulationRules} from "./simulation-detection";

/** Preserve Quiz preparation unchanged; a proven chronology must not depend on finding Quiz definitions. */
export function prepareDocumentForActivities(extracted:ExtractedDocument){
 const started=performance.now();
 try{return analyzeDocumentDeterministically(extracted);}catch(error){
  if(!(error instanceof InsufficientAcademicContentError)&&!(error instanceof Error&&error.message==="No hay suficiente contenido académico después de separar los datos administrativos."))throw error;
  const document=normalizeDocument(extracted,24),rules=detectSimulationRules(document.fragments),candidate=detectTimelines(document.fragments).candidates.find(()=>true)??(rules.length?{mode:"DECISIONS",section:"Reglas de decisión documentadas",events:rules.map(r=>({title:r.condition.slice(0,85),description:`Si ${r.condition}, entonces ${r.action}; en caso contrario, ${r.alternative}.`,sourceFragmentIds:r.sourceFragmentIds}))}:null)??{mode:"EXPLORATORY",section:"Ideas del material",events:academicDraftIdeas(document.fragments).slice(0,12).map(({text,source},i)=>({title:`Idea ${i+1}: ${text.split(/\s+/).slice(0,7).join(" ")}`.slice(0,85),description:text,sourceFragmentIds:[source.id]}))};if(!candidate.events.length)throw error;
  const events=candidate.events,ranking=rankAcademicFragments(document),candidates=events.map((e,i)=>({id:`timeline-concept-${i+1}`,name:e.title,type:candidate.mode==="PROCESS_TIMELINE"?"process" as const:"relationship" as const,importanceScore:events.length-i,sourceFragmentIds:e.sourceFragmentIds,section:document.fragments.find(f=>f.id===e.sourceFragmentIds[0])!.sectionHeading,pages:[...new Set(e.sourceFragmentIds.map(id=>document.fragments.find(f=>f.id===id)!.page))]}));
  const claim=(id:string,text:string,ids:string[])=>({id,text:text.slice(0,600),sourceFragmentIds:ids,sourceReferences:resolveSourceIds(ids,document.fragments,document.documentId)}),refs=[...new Set(events.flatMap(e=>e.sourceFragmentIds))].slice(0,40);
  const analysis=analysisSchema.parse({documentId:document.documentId,title:document.name.replace(/\.pdf$/i,"").slice(0,160),subject:candidate.mode==="EXPLORATORY"?"Ideas para exploración y revisión docente":candidate.mode==="DECISIONS"?"Decisiones con condiciones explícitas":"Acontecimientos o etapas con evidencia explícita",unit:"",summary:`Se detectaron ${events.length} elementos con referencias canónicas para revisión docente. No se ha realizado análisis mediante IA.`,sourceFragmentIds:refs,sourceReferences:resolveSourceIds(refs,document.fragments,document.documentId),keyConcepts:candidates.map(c=>claim(c.id,c.name,c.sourceFragmentIds)),learningObjectives:candidates.map(c=>claim(`goal-${c.id}`,`Interpretar ${c.name} dentro del recorrido del material.`,c.sourceFragmentIds)),sections:[claim("timeline-section",candidate.section||"Recorrido del documento",refs.slice(0,4))],importantFacts:events.map((e,i)=>claim(`timeline-fact-${i+1}`,e.description,e.sourceFragmentIds)),relationships:[],excludedAdministrativeContent:[]});
  return hybridPreparedSchema.parse({method:"deterministic",document,analysis,candidates,ranking,relations:detectSourceRelations(document),preprocessingMs:performance.now()-started});
 }
}
