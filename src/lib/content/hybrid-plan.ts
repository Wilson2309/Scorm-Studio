import {blueprintSchema,type BlueprintSlot,type StudioQuiz} from "./schema";
import {summarizeBlueprint} from "./blueprint";
import {type HybridPrepared,type HybridPlan,type HybridCandidate,type QuestionFamily} from "./hybrid-schema";
import {terms,similarity} from "./quality-heuristics";
import {resolveSourceIds} from "./grounding";
import {canPrecompileTarget} from "./lean-question-compiler";
import {canonical} from "./text";
export class AssessmentCapacityError extends Error{
 readonly code="insufficient_assessment_content";
 constructor(readonly requested:number,readonly available:number){
  super(`Este documento no contiene suficiente información evaluable para generar ${requested} preguntas con respuestas fiables. Se pueden preparar ${available} preguntas fundamentadas. Reduce la cantidad, cambia el PDF o crea preguntas manualmente.`);
  this.name="AssessmentCapacityError";
 }
}

export function relatedCandidates(target:HybridCandidate,pool:HybridCandidate[]){
 const words=new Set(terms(target.name));
 return pool.filter(c=>c.id!==target.id&&similarity(c.name,target.name)<.65).map(c=>({c,score:(c.section===target.section?3:0)+(c.sourceFragmentIds.some(id=>target.sourceFragmentIds.includes(id))?3:0)+terms(c.name).filter(w=>words.has(w)).length})).filter(r=>r.score>=2).sort((a,b)=>b.score-a.score||b.c.importanceScore-a.c.importanceScore).slice(0,4).map(r=>r.c);
}
export function buildHybridPlan(prepared:HybridPrepared,count:number,coverageMode:"breadth"|"depth"="breadth",writing:"automatic"|"manual"="automatic"):HybridPlan{
 if(!Number.isInteger(count)||count<3||count>20)throw new Error("Elige entre 3 y 20 preguntas.");
 const candidates=prepared.analysis.keyConcepts.map(c=>prepared.candidates.find(item=>item.id===c.id)!).filter(Boolean).filter(c=>writing==="manual"||canPrecompileTarget(c,prepared));
 // Analysis candidates already carry the deterministic diversity order.
 const targets=candidates.slice(0,count);
 if(targets.length!==count)throw new AssessmentCapacityError(count,candidates.length);
 const slots:BlueprintSlot[]=targets.map((target,i)=>{
  const sourceIds=[...target.sourceFragmentIds].filter(id=>writing==="manual"||prepared.document.fragments.some(f=>f.id===id&&canonical(f.normalizedText).includes(canonical(target.name)))).sort((a,b)=>(prepared.ranking.find(r=>r.fragmentId===b)?.score??0)-(prepared.ranking.find(r=>r.fragmentId===a)?.score??0)).slice(0,1);
  const evidence=prepared.document.fragments.filter(f=>sourceIds.includes(f.id)).map(f=>f.normalizedText).join(' ');
  const comparison=/mientras que|difiere|versus|versiones superiores[\s\S]*complementarios/i.test(evidence);
  const process=/mediante|metodolog|pruebas|proceso|permite|aplica/i.test(evidence);
  const cognitiveLevel=i%3===2&&comparison?"analysis":i%3===1&&process?"application":"comprehension";
  const family:QuestionFamily=cognitiveLevel==="analysis"?"comparison":cognitiveLevel==="application"?"short_scenario":comparison?"distinction":prepared.relations.some(r=>r.sourceFragmentIds.some(id=>sourceIds.includes(id)))?"relationship":target.type==="process"?"process":"distinction";
  const related=relatedCandidates(target,prepared.candidates);
  const goal=prepared.analysis.learningObjectives.find(g=>g.sourceFragmentIds.some(id=>sourceIds.includes(id)))??prepared.analysis.learningObjectives[0];
  return {slot:i+1,slotId:`slot-${i+1}`,questionId:`q${i+1}`,conceptId:target.id,objectiveId:goal.id,targetConcept:target.name,targetLearningObjective:goal.text,cognitiveLevel,difficulty:i===0?"initial":cognitiveLevel==="analysis"?"advanced":"intermediate",perspective:cognitiveLevel==="analysis"?"compare":cognitiveLevel==="application"?"use":"interpret",allowedSourceFragmentIds:sourceIds,questionFamily:family,relatedConceptIds:related.map(c=>c.id),distractorCandidateIds:related.slice(0,3).map(c=>c.id)};
 });
 return {blueprint:blueprintSchema.parse(summarizeBlueprint(slots,coverageMode)),selectedConceptIds:targets.map(c=>c.id)};
}
export function createManualQuiz(prepared:HybridPrepared,plan:HybridPlan,title:string,scored:boolean):StudioQuiz{
 return {version:2,generator:"content-intelligence-v1",title,description:prepared.analysis.summary,sourceName:prepared.document.name,scored,passingScore:70,analysis:prepared.analysis,sources:prepared.document.fragments,blueprint:plan.blueprint,questions:plan.blueprint.slots.map(s=>({id:s.questionId,slotId:s.slotId,questionFamily:s.questionFamily,documentId:prepared.document.documentId,stem:"",options:(["a","b","c","d"] as const).map(id=>({id,text:""})),correctOptionId:"a",explanation:"",concept:s.conceptId,learningObjective:s.objectiveId,cognitiveLevel:s.cognitiveLevel,difficulty:s.difficulty,sourceFragmentIds:s.allowedSourceFragmentIds.slice(0,4),sourceReferences:resolveSourceIds(s.allowedSourceFragmentIds.slice(0,4),prepared.document.fragments,prepared.document.documentId)}))};
}
