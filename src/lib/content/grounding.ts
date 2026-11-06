import {z} from "zod";
import {analysisSchema,educationalQuestionSchema,fragmentIdsSchema,type SourceFragment,type SourceReference,type DocumentAnalysis,type EducationalQuestion} from "./schema";

// Wire contracts contain IDs only. Display quotes/pages are application-owned
// compatibility DTOs for the existing studio and unchanged SCORM renderer.
const claim=z.object({id:z.string().min(1).max(40),text:z.string().min(3).max(240),sourceFragmentIds:fragmentIdsSchema}).strict();
export const analysisOutputSchema=analysisSchema.omit({documentId:true,sourceReferences:true}).extend({
  summary:z.string().min(20).max(450),learningObjectives:z.array(claim).min(1).max(3),keyConcepts:z.array(claim).min(1).max(5),
  sections:z.array(claim).min(1).max(3),importantFacts:z.array(claim).min(1).max(3),relationships:z.array(claim).max(2),
  sourceFragmentIds:fragmentIdsSchema,excludedAdministrativeContent:analysisSchema.shape.excludedAdministrativeContent.max(8),
});
export const questionOutputSchema=educationalQuestionSchema.omit({documentId:true,sourceReferences:true,requestedCognitiveLevel:true,actualCognitiveLevel:true,slotId:true,questionFamily:true});

export function resolveSourceIds(ids:string[],sources:SourceFragment[],documentId:string):SourceReference[]{
  if(!ids.length||new Set(ids).size!==ids.length)throw new Error("Referencias vacías o duplicadas.");
  return ids.map(id=>{
    const source=sources.find(f=>f.id===id);
    if(!source||source.documentId!==documentId||source.contentType!=="academic"||!Number.isInteger(source.page)||source.page<1||!id.startsWith(`p${source.page}-`))throw new Error("La referencia no pertenece al documento académico actual.");
    return {fragmentId:source.id,page:source.page,quote:source.text.slice(0,1200)};
  });
}
export function hydrateAnalysis(input:z.infer<typeof analysisOutputSchema>,sources:SourceFragment[]):DocumentAnalysis{
  const documentId=sources[0]?.documentId;if(!documentId)throw new Error("No hay fuentes para el análisis.");
  const claim=(item:z.infer<typeof analysisOutputSchema>["keyConcepts"][number])=>({...item,sourceReferences:resolveSourceIds(item.sourceFragmentIds,sources,documentId)});
  return analysisSchema.parse({...input,documentId,sourceReferences:resolveSourceIds(input.sourceFragmentIds,sources,documentId),learningObjectives:input.learningObjectives.map(claim),keyConcepts:input.keyConcepts.map(claim),sections:input.sections.map(claim),importantFacts:input.importantFacts.map(claim),relationships:input.relationships.map(claim)});
}
export function hydrateQuestion(input:z.infer<typeof questionOutputSchema>,sources:SourceFragment[]):EducationalQuestion{
  const documentId=sources[0]?.documentId;if(!documentId)throw new Error("No hay fuentes para la pregunta.");
  return educationalQuestionSchema.parse({...input,documentId,sourceReferences:resolveSourceIds(input.sourceFragmentIds,sources,documentId)});
}
type ModelClaim=Pick<DocumentAnalysis["keyConcepts"][number],"id"|"text"|"sourceFragmentIds">;
export function analysisForModel(analysis:Pick<DocumentAnalysis,"title"|"subject"|"unit"|"summary">&{keyConcepts:ModelClaim[];learningObjectives:ModelClaim[]}){
  return {...analysis,keyConcepts:analysis.keyConcepts.map(({id,text,sourceFragmentIds})=>({id,text,sourceFragmentIds})),learningObjectives:analysis.learningObjectives.map(({id,text,sourceFragmentIds})=>({id,text,sourceFragmentIds}))};
}
