import {studioQuizSchema,type StudioQuiz} from "./schema";
import {canonical} from "./text";
import {resolveSourceIds} from "./grounding";
import {assertAnalysisGrounded,referenceProblem} from "./grounding-validation";
import {questionMatchesSlot} from "./blueprint";
import {terms,similarity,cognitiveSignals,isAdministrativeQuestion} from "./quality-heuristics";
import type {QualityIssue,QualitySeverity,QualityDimension,QuizQualityResult} from "./quality-types";
import {cognitiveDecisions} from "./cognitive-normalization";
import {optionQualityHints} from "./option-quality";

const dimensions:QualityDimension[]=["structure","grounding","coverage","cognition","distractors","diversity"];
const titles:Record<QualityDimension,string>={structure:"Estructura",grounding:"Fuentes",coverage:"Cobertura",cognition:"Nivel cognitivo",distractors:"Opciones",diversity:"Variedad"};
const shares=(a:string[],b:string[])=>a.some(id=>b.includes(id));
const sameSet=(a:string[],b:string[])=>a.length===b.length&&a.every(id=>b.includes(id));

/** Pure, deterministic review aid. The score is not a Bloom certification or
 * proof of entailment. Only BLOCKING issues prevent export. */
export class QuizQualityValidator {
  evaluate(input:unknown):QuizQualityResult{
    const parsed=studioQuizSchema.safeParse(input),issues:QualityIssue[]=[];
    const add=(questionId:string|null,code:string,message:string,dimension:QualityDimension,severity:QualityIssue["severity"]="BLOCKING",relatedQuestionIds?:string[])=>{
      if(!issues.some(i=>i.questionId===questionId&&i.code===code))issues.push({questionId,code,message,dimension,severity,title:titles[dimension],...(relatedQuestionIds?{relatedQuestionIds}:{})});
    };
    if(!parsed.success){
      const raw=input&&typeof input==="object"&&"questions" in input&&Array.isArray(input.questions)?input.questions:[];
      const ids=raw.map((q,i)=>q&&typeof q==="object"&&"id" in q&&typeof q.id==="string"?q.id:`q${i+1}`);
      const labels:Record<string,string>={stem:"Completa el enunciado con al menos 15 caracteres.",text:"Completa el texto de cada opción.",options:"Define cuatro opciones completas.",correctOptionId:"Selecciona una respuesta correcta disponible.",explanation:"Añade una explicación de al menos 20 caracteres.",sourceReferences:"Selecciona al menos una fuente disponible.",sourceFragmentIds:"Selecciona al menos una fuente disponible.",cognitiveLevel:"Selecciona un nivel cognitivo válido.",difficulty:"Selecciona una dificultad válida."};
      for(const error of parsed.error.issues){const field=[...error.path].reverse().find(p=>typeof p==="string") as string|undefined;add(error.path[0]==="questions"&&typeof error.path[1]==="number"?ids[error.path[1]]:null,"schema",labels[field??""]??"Completa la estructura de las preguntas y su plan de evaluación.","structure");}
      return this.result(issues,ids,undefined);
    }
    const quiz=parsed.data,decisions=cognitiveDecisions(quiz),excluded=new Set(quiz.analysis.excludedAdministrativeContent.map(e=>e.fragmentId));
    const sources=quiz.sources.filter(s=>s.contentType==="academic"&&!excluded.has(s.id));
    try{assertAnalysisGrounded(quiz.analysis,quiz.sources);}catch(e){add(null,"analysis_grounding",e instanceof Error?e.message:"El análisis no tiene fuentes válidas.","grounding");}
    if(new Set(quiz.sources.map(s=>s.id)).size!==quiz.sources.length)add(null,"source_ids","Hay identificadores de fuentes duplicados.","grounding");
    if(quiz.blueprint.questionCount!==quiz.questions.length||quiz.blueprint.slots.length!==quiz.questions.length)add(null,"blueprint_count","La cantidad no coincide con el plan de evaluación.","structure");
    if(new Set(quiz.blueprint.slots.map(s=>s.questionId)).size!==quiz.blueprint.slots.length)add(null,"blueprint_ids","El plan repite una pregunta asignada.","structure");
    const expected=quiz.blueprint.difficultyDistribution;
    if(expected.initial+expected.intermediate+expected.advanced!==quiz.questions.length)add(null,"blueprint_distribution","La distribución de dificultad no coincide con el plan.","structure");
    for(const level of ["initial","intermediate","advanced"] as const)if(quiz.blueprint.slots.filter(s=>s.difficulty===level).length!==expected[level])add(null,"blueprint_distribution","La distribución declarada no coincide con los objetivos asignados.","structure");
    const plannedConcepts=[...new Set(quiz.blueprint.slots.map(s=>s.conceptId))];
    if(!sameSet(plannedConcepts,quiz.blueprint.conceptsCovered)||!sameSet([...new Set(quiz.blueprint.slots.map(s=>s.objectiveId))],quiz.blueprint.learningObjectivesCovered)||!sameSet([...new Set(quiz.blueprint.slots.map(s=>s.cognitiveLevel))],quiz.blueprint.cognitiveLevels))add(null,"blueprint_summary","La cobertura declarada no coincide con las asignaciones del plan.","structure");
    for(const [index,q] of quiz.questions.entries()){
      const previous=quiz.questions.slice(0,index),answer=q.options.find(o=>o.id===q.correctOptionId),stem=canonical(q.stem);
      if(previous.some(other=>other.id===q.id))add(q.id,"duplicate_id","El identificador de esta pregunta está repetido.","structure");
      if(previous.some(other=>canonical(other.stem)===stem||similarity(other.stem,q.stem)>.84))add(q.id,"duplicate_question","Esta pregunta repite prácticamente el contenido de otra.","diversity");
      if(/completa segun|rellena el|complete the|fill in the/.test(stem)||/_{3,}/.test(q.stem))add(q.id,"cloze","Sustituye completar huecos por una tarea de comprensión, aplicación o análisis.","cognition");
      if(isAdministrativeQuestion(q.stem)||/(?:cuantas|numero de|duracion|cuanto dura).{0,40}(?:curso|asignatura|unidad lectiva|horas lectivas|carga horaria)/.test(stem))add(q.id,"administrative","El enunciado evalúa datos administrativos del documento.","coverage");
      if(new Set(q.options.map(o=>o.id)).size!==4||!answer)add(q.id,"invalid_answer","Define cuatro opciones únicas y una respuesta correcta disponible.","structure");
      const options=q.options.map(o=>canonical(o.text));
      if(new Set(options).size!==4)add(q.id,"duplicate_options","Las opciones deben ser distintas, también al normalizar signos y acentos.","structure");
      if(options.some(o=>/^(?:todas|ninguna) (?:de )?las anteriores|^(?:all|none) of the above/.test(o)))add(q.id,"meta_option","Sustituye todas o ninguna de las anteriores por alternativas concretas.","distractors");
      for(let i=0;i<options.length;i++)for(let j=i+1;j<options.length;j++)if(similarity(options[i],options[j])>.8)add(q.id,"equivalent_options","Dos opciones son casi equivalentes. Contrasta si permiten una sola respuesta.","distractors","WARNING");
      if(answer&&q.options.some(o=>o.id!==answer.id&&canonical(o.text).includes(canonical(answer.text))))add(q.id,"answer_leak","Un distractor contiene literalmente la respuesta correcta.","distractors");
      const lengths=q.options.map(o=>o.text.length);
      if(Math.max(...lengths)>Math.max(35,Math.min(...lengths)*3.5))add(q.id,"option_lengths","La diferencia de longitud puede revelar la respuesta.","distractors","WARNING");
      for(const ref of q.sourceReferences){const problem=referenceProblem(ref,sources);if(problem)add(q.id,"unsupported_reference",problem,"grounding");}
      let evidence="";
      try{
        if(q.documentId!==quiz.analysis.documentId)throw new Error("La pregunta pertenece a otro documento.");
        const resolved=resolveSourceIds(q.sourceFragmentIds,sources,q.documentId);evidence=q.sourceFragmentIds.map(id=>sources.find(f=>f.id===id)?.normalizedText??"").join(" ");
        if(JSON.stringify(resolved)!==JSON.stringify(q.sourceReferences))add(q.id,"unsupported_reference","Las evidencias visibles deben proceder del catálogo canónico.","grounding");
      }catch(e){add(q.id,"unsupported_reference",e instanceof Error?e.message:"No se encuentran las fuentes.","grounding");}
      if(answer&&terms(answer.text).length&&!terms(answer.text).some(w=>terms(evidence).includes(w)))add(q.id,"answer_support","Revisa el respaldo conceptual de la respuesta en la fuente seleccionada.","grounding","WARNING");
      const concept=quiz.analysis.keyConcepts.find(c=>c.id===q.concept);
      if(!concept)add(q.id,"concept","Selecciona un concepto del análisis.","coverage");
      if(!quiz.analysis.learningObjectives.some(o=>o.id===q.learningObjective))add(q.id,"objective","Selecciona un objetivo del análisis.","coverage");
      const slot=quiz.blueprint.slots[index];
      const decision=decisions.find(d=>d.questionId===q.id)!,recorded=q.requestedCognitiveLevel!==undefined||q.actualCognitiveLevel!==undefined;
      const recordValid=recorded&&q.requestedCognitiveLevel===decision.requested&&q.actualCognitiveLevel===decision.actual;
      if(recorded&&!recordValid)add(q.id,"cognitive_record","El nivel registrado ya no corresponde al enunciado. Guarda la edición para volver a revisarlo.","cognition");
      if(!slot||slot.questionId!==q.id||!questionMatchesSlot(q,slot,recordValid&&decision.downgraded?decision.actual:slot.cognitiveLevel))add(q.id,"blueprint_slot","La pregunta cambió el concepto, nivel, dificultad o fuentes que tenía asignados. Regénérala con su plan original.","coverage");
      if(slot){
        if(slot.targetConcept!==quiz.analysis.keyConcepts.find(c=>c.id===slot.conceptId)?.text||slot.targetLearningObjective!==quiz.analysis.learningObjectives.find(o=>o.id===slot.objectiveId)?.text)add(q.id,"blueprint_target","El plan debe usar conceptos y objetivos del análisis actual.","coverage");
        try{resolveSourceIds(slot.allowedSourceFragmentIds,sources,quiz.analysis.documentId);}catch{add(q.id,"blueprint_sources","El plan incluye fuentes no disponibles para esta pregunta.","grounding");}
      }
      const signals=cognitiveSignals(q.stem);
      if(recordValid&&decision.downgraded)add(q.id,"cognitive_normalized",`Se solicitó ${decision.requested==="analysis"?"Análisis":"Aplicación"}, pero la pregunta evalúa ${decision.actual==="application"?"Aplicación":"Comprensión"}. Se ajustó automáticamente.`,"cognition","INFO");
      if(decision.conflict)add(q.id,"cognitive_distribution_conflict","La tarea es más sencilla de lo solicitado. Ajustarla dejaría incompleto el plan; regenera esta pregunta como un caso con razonamiento.","cognition","WARNING");
      if(q.cognitiveLevel==="analysis"&&(!signals.scenario||!signals.reasoning))add(q.id,"cognitive_alignment",signals.scenario?"Se solicitó Análisis, pero la pregunta pide elegir una acción. Regenera un caso que requiera comparar factores o diagnosticar una causa.":"Se solicitó Análisis, pero la pregunta evalúa reconocimiento o comprensión. Regenera un caso que exija razonamiento.","cognition","WARNING");
      if(q.cognitiveLevel==="application"&&(!signals.scenario||!signals.action))add(q.id,"cognitive_alignment","Declarada como Aplicación, pero no se distingue un problema concreto y una decisión. Plantea un caso breve que exija usar el concepto.","cognition","WARNING");
      if(q.cognitiveLevel==="comprehension"&&signals.recognition&&!signals.scenario)add(q.id,"cognitive_alignment","El enunciado parece pedir una definición o reconocimiento. Revisa si exige explicar, distinguir o interpretar.","cognition","WARNING");
      const domain=new Set(terms(`${concept?.text??""} ${q.stem} ${quiz.analysis.keyConcepts.map(c=>c.text).join(" ")}`));
      const distractors=q.options.filter(o=>o.id!==q.correctOptionId);
      const relatedIds=new Set([...(slot?.relatedConceptIds??[]),...(slot?.distractorCandidateIds??[])]),nearIds=new Set(quiz.analysis.keyConcepts.filter(c=>relatedIds.has(c.id)).flatMap(c=>c.sourceFragmentIds)),sections=new Set(sources.filter(f=>q.sourceFragmentIds.includes(f.id)).map(f=>f.sectionHeading).filter(Boolean));
      const neighbourhood=sources.filter(f=>q.sourceFragmentIds.includes(f.id)||nearIds.has(f.id)||!!f.sectionHeading&&sections.has(f.sectionHeading)).map(f=>f.normalizedText).join(" ");
      const hints=optionQualityHints(q,evidence,`${concept?.text??""} ${neighbourhood}`);
      for(const hint of hints){const pair=/^similar_options_(\d+)_(\d+)$/.exec(hint.code);if(pair&&similarity(options[Number(pair[1])],options[Number(pair[2])])>.8)continue;add(q.id,hint.code,hint.message,"distractors",hint.blocking?"BLOCKING":"WARNING");}
      const unrelated=distractors.filter(o=>terms(o.text).length>1&&!terms(o.text).some(w=>domain.has(w)));
      const arbitrary=distractors.some(o=>/\b(?:cada|a los) (?:\d+|seis|tres|dos|un) (?:meses|dias|horas|anos)\b/.test(canonical(o.text))&&!/tiempo|period|duracion|mes|hora|dia/.test(stem));
      if(unrelated.length&&!hints.some(h=>h.code==="outside_domain")||arbitrary)add(q.id,"distractor_domain","Algún distractor parece ajeno al concepto o introduce una condición arbitraria. Usa métodos, interpretaciones o consecuencias plausibles del mismo tema.","distractors","WARNING");
      const irrelevantThreshold=distractors.some(o=>/\b(?:\d+|uno|dos|tres|cuatro|cinco|seis) (?:letras|clics|meses|dias|veces)\b/.test(canonical(o.text)))&&!/\b(?:cuantos|numero|cantidad|plazo|clics|tiempo|letras|maximo|minimo)\b/.test(stem);
      const disregard=distractors.some(o=>/sin importar (?:el |la |los |las )?(?:contenido|usuario|contexto|necesidad)|independientemente de (?:el |la |los |las )?(?:contenido|usuario|necesidad)/.test(canonical(o.text)));
      if(irrelevantThreshold||disregard)add(q.id,"implausible_distractor","Un distractor añade límites arbitrarios o propone ignorar el contexto o las necesidades del usuario. Contrasta su plausibilidad.","distractors","WARNING");
      if(answer){
        const otherLengths=distractors.map(o=>o.text.length).sort((a,b)=>a-b),median=otherLengths[1]??1;
        if(answer.text.length>Math.max(70,median*2.2))add(q.id,"answer_specificity","La respuesta correcta es mucho más detallada que los distractores.","distractors","WARNING");
        if(terms(answer.text).length>=6&&canonical(evidence).includes(canonical(answer.text))&&unrelated.length>=2)add(q.id,"verbatim_answer_cue","La respuesta reproduce la fuente mientras los distractores son genéricos. Equilibra precisión y redacción.","distractors","WARNING");
        if(/^(?:por que|porque|para|mediante)\b/.test(canonical(answer.text))&&distractors.every(o=>!/^(?:por que|porque|para|mediante)\b/.test(canonical(o.text))))add(q.id,"option_grammar","La sintaxis de la opción correcta destaca frente a las demás. Redacta alternativas paralelas.","distractors","WARNING");
      }
      for(const other of previous){
        const sameConcept=q.concept===other.concept,overlap=shares(q.sourceFragmentIds,other.sourceFragmentIds);
        if(sameConcept&&overlap)add(q.id,"duplicate_concept_source",`Este concepto y su fuente ya se evalúan en ${other.id}. Selecciona otro concepto o una evidencia y perspectiva diferentes.`,"coverage","BLOCKING",[other.id,q.id]);
        else if(sameConcept){
          const permitted=quiz.analysis.keyConcepts.length<quiz.questions.length||quiz.blueprint.coverageMode==="depth";
          const otherSlot=quiz.blueprint.slots.find(s=>s.questionId===other.id);
          if(!permitted||q.cognitiveLevel===other.cognitiveLevel||slot?.perspective===otherSlot?.perspective)add(q.id,"concept_repetition","La repetición necesita una razón de cobertura y otro nivel, fuente y perspectiva.","coverage");
          else add(q.id,"concept_repetition","Concepto ya evaluado con otra fuente y perspectiva. Contrasta que la nueva tarea aporte profundidad.","coverage","WARNING",[other.id,q.id]);
        }
        const otherAnswer=other.options.find(o=>o.id===other.correctOptionId);
        if(overlap&&answer&&otherAnswer&&similarity(answer.text,otherAnswer.text)>.8&&similarity(q.stem,other.stem)>.45)add(q.id,"semantic_duplicate","La tarea y la respuesta repiten prácticamente las de otra pregunta.","diversity","BLOCKING",[other.id,q.id]);
        if(q.options.some(o=>other.options.some(p=>canonical(o.text)===canonical(p.text))))add(q.id,"option_reuse","Se reutilizan opciones de otra pregunta. Revisa pistas o redundancias.","diversity","INFO",[other.id,q.id]);
      }
      const opening=stem.split(" ").slice(0,4).join(" ");
      if(quiz.questions.filter(other=>canonical(other.stem).startsWith(opening)).length>=3)add(q.id,"repeated_template","Tres o más preguntas repiten la misma apertura. Varía el planteamiento.","diversity","WARNING");
    }
    const covered=new Set(quiz.questions.map(q=>q.concept));
    if(covered.size<Math.min(quiz.analysis.keyConcepts.length,quiz.questions.length)&&quiz.blueprint.coverageMode!=="depth")add(null,"concept_coverage","Hay conceptos importantes disponibles que aún no se evalúan.","coverage","WARNING");
    const relevant=new Set(quiz.blueprint.slots.flatMap(s=>s.allowedSourceFragmentIds));
    for(const id of relevant){const questions=quiz.questions.filter(q=>q.sourceFragmentIds.includes(id));if(questions.length>=Math.max(3,Math.ceil(quiz.questions.length*.6))&&relevant.size>1)add(null,"source_concentration","Gran parte del quiz depende de un mismo fragmento, aunque existen otras fuentes pertinentes.","diversity","WARNING",questions.map(q=>q.id));}
    if(quiz.questions.length>=5&&quiz.questions.every(q=>q.cognitiveLevel==="remember"||q.cognitiveLevel==="comprehension"))add(null,"cognitive_distribution","Toda la evaluación se concentra en recuerdo y comprensión.","cognition","INFO");
    const analysisQuestions=quiz.questions.filter(q=>q.cognitiveLevel==="analysis");
    if(analysisQuestions.length&&!quiz.questions.some(q=>cognitiveSignals(q.stem).inferred==="analysis"))add(null,"inferred_cognitive_distribution","Hay tareas declaradas como análisis, pero ninguna muestra señales claras de diagnóstico, comparación o inferencia en un caso. Contrasta el nivel real.","cognition","WARNING",analysisQuestions.map(q=>q.id));
    if(quiz.questions.length>=5&&new Set(quiz.questions.map(q=>q.difficulty)).size===1)add(null,"difficulty_distribution","Toda la evaluación tiene la misma dificultad. Contrasta la distribución prevista.","coverage","INFO");
    return this.result(issues,quiz.questions.map(q=>q.id),quiz);
  }
  private result(issues:QualityIssue[],ids:string[],quiz:StudioQuiz|undefined):QuizQualityResult{
    const status=(list:QualityIssue[]):QualitySeverity=>list.some(i=>i.severity==="BLOCKING")?"BLOCKING":list.some(i=>i.severity==="WARNING")?"WARNING":"PASS";
    const scores=Object.fromEntries(dimensions.map(d=>{const subset=issues.filter(i=>i.dimension===d),evaluated=!!quiz||d==="structure";return [d,{status:evaluated?status(subset):"WARNING",score:evaluated?Math.max(0,100-subset.reduce((n,i)=>n+(i.severity==="BLOCKING"?35:i.severity==="WARNING"?8:0),0)):null,evaluated}];})) as QuizQualityResult["dimensions"];
    const questions=ids.map(id=>{const own=issues.filter(i=>i.questionId===id||i.questionId!==null&&i.relatedQuestionIds?.includes(id)||i.questionId===null&&i.severity==="BLOCKING");return {id,status:status(own),inferredCognitiveLevel:quiz?cognitiveSignals(quiz.questions.find(q=>q.id===id)!.stem).inferred:"unknown",issues:own};});
    const blockingCount=issues.filter(i=>i.severity==="BLOCKING").length,warningCount=issues.filter(i=>i.severity==="WARNING").length;
    const count=(values:string[])=>values.reduce<Record<string,number>>((result,key)=>(result[key]=(result[key]??0)+1,result),{});
    const coverage={conceptsAvailable:quiz?.analysis.keyConcepts.length??0,conceptsUsed:new Set(quiz?.questions.map(q=>q.concept)).size,sourceCounts:count(quiz?.questions.flatMap(q=>q.sourceFragmentIds)??[]),declaredCognitiveCounts:count(quiz?.questions.map(q=>q.cognitiveLevel)??[]),suggestedCognitiveCounts:count(questions.map(q=>q.inferredCognitiveLevel)),difficultyCounts:count(quiz?.questions.map(q=>q.difficulty)??[])};
    return {valid:blockingCount===0,validCount:questions.filter(q=>q.status!=="BLOCKING").length,status:status(issues),score:quiz?Math.round(dimensions.reduce((n,d)=>n+(scores[d].score??0),0)/dimensions.length):0,scoreMeaning:"engineering-heuristic",issues,blockingCount,warningCount,infoCount:issues.filter(i=>i.severity==="INFO").length,passCount:questions.filter(q=>q.status==="PASS").length,warningQuestionCount:questions.filter(q=>q.status==="WARNING").length,blockingQuestionCount:questions.filter(q=>q.status==="BLOCKING").length,dimensions:scores,coverage,questions};
  }
}
