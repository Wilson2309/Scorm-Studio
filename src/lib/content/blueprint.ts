import {blueprintSchema,blueprintSlotSchema,type DocumentAnalysis,type BlueprintSlot,type QuizBlueprint,type EducationalQuestion,type StudioQuiz} from "./schema";

type Assignment=Pick<BlueprintSlot,"conceptId"|"objectiveId"|"difficulty"|"cognitiveLevel">;
export function describeSlot(analysis:DocumentAnalysis,assignment:Assignment,questionId:string,index:number,sourceIds?:string[]):BlueprintSlot{
  const concept=analysis.keyConcepts.find(c=>c.id===assignment.conceptId),objective=analysis.learningObjectives.find(o=>o.id===assignment.objectiveId);
  if(!concept||!objective)throw new Error("El plan necesita conceptos y objetivos del analisis actual.");
  const excluded=new Set(analysis.excludedAdministrativeContent.map(e=>e.fragmentId));
  const allowedSourceFragmentIds=[...new Set(sourceIds??concept.sourceFragmentIds)].filter(id=>!excluded.has(id));
  return blueprintSlotSchema.parse({...assignment,slot:index+1,questionId,targetConcept:concept.text,targetLearningObjective:objective.text,allowedSourceFragmentIds,
    perspective:assignment.cognitiveLevel==="analysis"?(index%2?"compare":"diagnose"):assignment.cognitiveLevel==="application"?"use":"interpret"});
}
export function summarizeBlueprint(slots:BlueprintSlot[],coverageMode:QuizBlueprint["coverageMode"]="breadth"):QuizBlueprint{
  return {questionCount:slots.length,coverageMode,conceptsCovered:[...new Set(slots.map(s=>s.conceptId))],learningObjectivesCovered:[...new Set(slots.map(s=>s.objectiveId))],
    difficultyDistribution:{initial:slots.filter(s=>s.difficulty==="initial").length,intermediate:slots.filter(s=>s.difficulty==="intermediate").length,advanced:slots.filter(s=>s.difficulty==="advanced").length},
    cognitiveLevels:[...new Set(slots.map(s=>s.cognitiveLevel))],questionTypes:["single-choice"],slots};
}
export function createBlueprint(analysis:DocumentAnalysis,count:number,coverageMode:QuizBlueprint["coverageMode"]="breadth"){
  const levels=["comprehension","application","analysis"] as const;
  const usedSources=new Map<string,Set<string>>(),assignedLevels=new Map<string,Set<string>>();
  const slots=Array.from({length:count},(_,i)=>{
    const concept=analysis.keyConcepts[i%analysis.keyConcepts.length];
    const prior=usedSources.get(concept.id)??new Set<string>();
    const available=concept.sourceFragmentIds.filter(id=>!prior.has(id));
    const selected=available.length?[available[0]]:concept.sourceFragmentIds;
    selected.forEach(id=>prior.add(id));usedSources.set(concept.id,prior);
    const objective=analysis.learningObjectives.find(o=>o.sourceFragmentIds.some(id=>selected.includes(id)))??analysis.learningObjectives[i%analysis.learningObjectives.length];
    const previous=assignedLevels.get(concept.id)??new Set<string>();
    let cognitiveLevel:BlueprintSlot["cognitiveLevel"]=levels[i%levels.length];
    if(previous.has(cognitiveLevel))cognitiveLevel=levels.find(level=>!previous.has(level))??cognitiveLevel;
    previous.add(cognitiveLevel);assignedLevels.set(concept.id,previous);
    return describeSlot(analysis,{conceptId:concept.id,objectiveId:objective.id,difficulty:i===0?"initial":i%3===2?"advanced":"intermediate",cognitiveLevel},`q${i+1}`,i,selected);
  });
  return blueprintSchema.parse(summarizeBlueprint(slots,coverageMode));
}
export function questionMatchesSlot(question:EducationalQuestion,slot:BlueprintSlot,acceptedLevel=slot.cognitiveLevel){
  return question.concept===slot.conceptId&&question.learningObjective===slot.objectiveId&&question.cognitiveLevel===acceptedLevel&&question.difficulty===slot.difficulty&&question.sourceFragmentIds.every(id=>slot.allowedSourceFragmentIds.includes(id))&&(!slot.questionFamily||question.questionFamily===slot.questionFamily)&&(!slot.slotId||question.slotId===slot.slotId);
}
// Explicit teacher edits may revise targets; model responses may not.
export function reviseTeacherQuestion(quiz:StudioQuiz,question:EducationalQuestion):StudioQuiz{
  // A deliberate teacher save starts a new review; old compiler annotations cannot survive edits.
  question={...question,requestedCognitiveLevel:undefined,actualCognitiveLevel:undefined};
  const index=quiz.questions.findIndex(q=>q.id===question.id);if(index<0)return quiz;
  if(!quiz.analysis.keyConcepts.some(c=>c.id===question.concept)||!quiz.analysis.learningObjectives.some(o=>o.id===question.learningObjective))return {...quiz,questions:quiz.questions.map(q=>q.id===question.id?question:q)};
  const previous=quiz.blueprint.slots.find(s=>s.questionId===question.id);
  const changed=!previous||!questionMatchesSlot(question,previous);
  const slots=quiz.blueprint.slots.map(s=>s.questionId===question.id&&changed?describeSlot(quiz.analysis,{conceptId:question.concept,objectiveId:question.learningObjective,cognitiveLevel:question.cognitiveLevel,difficulty:question.difficulty},question.id,index,[...new Set([...(quiz.analysis.keyConcepts.find(c=>c.id===question.concept)?.sourceFragmentIds??[]),...question.sourceFragmentIds])]):s);
  return {...quiz,questions:quiz.questions.map(q=>q.id===question.id?question:q),blueprint:summarizeBlueprint(slots,quiz.blueprint.coverageMode)};
}
