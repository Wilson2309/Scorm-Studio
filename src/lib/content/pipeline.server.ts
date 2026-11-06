import "server-only";
import { analysisSchema, studioQuizSchema, type DocumentAnalysis, type NormalizedDocument, type StudioQuiz, type QuizBlueprint } from "./schema";
import { normalizeDocument, chunkDocument } from "./normalize";
import { assertAnalysisGrounded } from "./quality";
import { createBlueprint,questionMatchesSlot,summarizeBlueprint } from "./blueprint";
import { IntelligenceError, type ContentIntelligenceProvider,type ExistingQuestionSummary } from "./provider-contract";
import { quizConfigSchema, type ExtractedDocument } from "../quiz/schema";
import {analysisForModel,resolveSourceIds} from "./grounding";
import {buildConceptPool,buildConstructionGuides} from "./question-builder";
import {compilePedagogicalQuiz} from "./pedagogical-compiler";

export async function analyzeContent(extracted:ExtractedDocument,provider:ContentIntelligenceProvider) {
  const document=normalizeDocument(extracted),chunks=chunkDocument(document),analyses:DocumentAnalysis[]=[];
  const semanticExclusions=new Map<string,string>();
  for(const fragments of chunks) {
    const analysis=analysisSchema.parse(await provider.analyzeDocument({fragments}));
    assertAnalysisGrounded(analysis,fragments);analyses.push(analysis);
    for(const e of analysis.excludedAdministrativeContent)semanticExclusions.set(e.fragmentId,e.reason);
  }
  let analysis=analyses[0];
  if(analyses.length>1) {
    // Hierarchical synthesis: at most two compact analyses per request. Only cited
    // source fragments accompany each synthesis, never the full PDF again.
    let level=analyses;
    while(level.length>1){
      const next:DocumentAnalysis[]=[];
      for(let i=0;i<level.length;i+=2){
        const group=level.slice(i,i+2);
        if(group.length===1){next.push(group[0]);continue;}
        const ids=new Set(group.flatMap(a=>[...a.sourceReferences,...a.keyConcepts.flatMap(c=>c.sourceReferences),...a.learningObjectives.flatMap(c=>c.sourceReferences),...a.sections.flatMap(c=>c.sourceReferences),...a.importantFacts.flatMap(c=>c.sourceReferences),...a.relationships.flatMap(c=>c.sourceReferences)].map(r=>r.fragmentId)));
        const fragments=document.fragments.filter(f=>ids.has(f.id));
        const synthesized=analysisSchema.parse(await provider.analyzeDocument({fragments,chunkAnalyses:group}));
        assertAnalysisGrounded(synthesized,fragments);next.push(synthesized);
        for(const e of synthesized.excludedAdministrativeContent)semanticExclusions.set(e.fragmentId,e.reason);
      }
      level=next;
    }
    analysis=level[0];
  }
  analysis={...analysis,excludedAdministrativeContent:[...semanticExclusions].map(([fragmentId,reason])=>({fragmentId,reason}))};
  analysis=analysisSchema.parse(analysis);
  assertAnalysisGrounded(analysis,document.fragments);
  return {document,analysis,processing:{chunks:chunks.length,excluded:document.excluded.length,method:"ai-grounded" as const}};
}
function relevantSources(document:NormalizedDocument,analysis:DocumentAnalysis,slots:QuizBlueprint["slots"]) {
  const ids=new Set(slots.flatMap(s=>s.allowedSourceFragmentIds));
  const excluded=new Set(analysis.excludedAdministrativeContent.map(e=>e.fragmentId));
  return document.fragments.filter(f=>ids.has(f.id)&&!excluded.has(f.id));
}
function compactAnalysis(analysis:DocumentAnalysis,slots:QuizBlueprint["slots"]){
  return analysisForModel({title:analysis.title,subject:analysis.subject,unit:analysis.unit,summary:analysis.summary,keyConcepts:analysis.keyConcepts.filter(c=>slots.some(s=>s.conceptId===c.id)),learningObjectives:analysis.learningObjectives.filter(c=>slots.some(s=>s.objectiveId===c.id))});
}
export async function buildEducationalQuiz(document:NormalizedDocument,analysis:DocumentAnalysis,config:unknown,provider:ContentIntelligenceProvider):Promise<StudioQuiz> {
  assertAnalysisGrounded(analysis,document.fragments);
  const settings=quizConfigSchema.parse(config),blueprint=createBlueprint(analysis,settings.count,settings.coverageMode);
  const constructionGuides=buildConstructionGuides(blueprint.slots,buildConceptPool(analysis,document.fragments),document.fragments);
  const batch=await provider.generateQuiz({analysis:compactAnalysis(analysis,blueprint.slots),blueprint,sources:relevantSources(document,analysis,blueprint.slots),avoidStems:[],constructionGuides});
  if(batch.length!==blueprint.slots.length)throw new IntelligenceError("La IA no respetó la cantidad de preguntas del plan. Reintenta la generación.");
  const questions=batch.map((q,i)=>({...q,id:`q${i+1}`}));
  const quiz=studioQuizSchema.parse({version:2,generator:"content-intelligence-v1",title:settings.title,description:analysis.summary,sourceName:document.name,scored:settings.scored,passingScore:70,questions,analysis,blueprint,sources:document.fragments});
  return compilePedagogicalQuiz(quiz).quiz;
}
export async function regenerate(document:NormalizedDocument,analysis:DocumentAnalysis,slot:QuizBlueprint["slots"][number],id:string,avoidStems:string[],provider:ContentIntelligenceProvider,existingQuestions:ExistingQuestionSummary[]=[]) {
  assertAnalysisGrounded(analysis,document.fragments);
  if(slot.questionId!==id||slot.targetConcept!==analysis.keyConcepts.find(c=>c.id===slot.conceptId)?.text||slot.targetLearningObjective!==analysis.learningObjectives.find(o=>o.id===slot.objectiveId)?.text)throw new IntelligenceError("La pregunta no coincide con su asignación original.");
  resolveSourceIds(slot.allowedSourceFragmentIds,document.fragments,document.documentId);
  const usedBySameConcept=new Set(existingQuestions.filter(q=>q.id!==id&&q.concept===slot.conceptId).flatMap(q=>q.sourceFragmentIds));
  if(slot.allowedSourceFragmentIds.every(source=>usedBySameConcept.has(source)))throw new IntelligenceError("El plan ya repite este concepto y sus fuentes. Ajusta la cobertura antes de regenerar.");
  const constructionGuides=buildConstructionGuides([slot],buildConceptPool(analysis,document.fragments),document.fragments);
  const question=await provider.regenerateQuestion({analysis:compactAnalysis(analysis,[slot]),blueprint:summarizeBlueprint([slot]),sources:relevantSources(document,analysis,[slot]),avoidStems,existingQuestions:existingQuestions.filter(q=>q.id!==id),nearbyConcepts:analysis.keyConcepts.filter(c=>c.id!==slot.conceptId).slice(0,4).map(({id,text})=>({id,text})),constructionGuides});
  if(!questionMatchesSlot(question,slot))throw new IntelligenceError("La nueva pregunta cambió su objetivo, nivel o fuentes asignados. No se sustituyó el borrador.");
  if(existingQuestions.some(q=>q.id!==id&&q.concept===question.concept&&q.sourceFragmentIds.some(source=>question.sourceFragmentIds.includes(source))))throw new IntelligenceError("La nueva pregunta vuelve a evaluar un concepto y una fuente ya utilizados. Revisa el plan antes de regenerar.");
  return {question:{...question,id}};
}
