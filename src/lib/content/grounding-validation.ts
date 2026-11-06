import type {DocumentAnalysis,SourceFragment,SourceReference} from "./schema";
import {resolveSourceIds} from "./grounding";
export function referenceProblem(ref: SourceReference, sources: SourceFragment[]) {
  const fragment=sources.find(f=>f.id===ref.fragmentId);
  if(!fragment || fragment.page!==ref.page) return "La referencia no corresponde a un fragmento y página disponibles.";
  return null;
}
export function assertAnalysisGrounded(analysis: DocumentAnalysis, sources: SourceFragment[]) {
  const excluded=new Set(analysis.excludedAdministrativeContent.map(e=>e.fragmentId));
  if([...excluded].some(id=>!sources.some(f=>f.id===id))) throw new Error("El análisis excluye referencias inexistentes.");
  const usable=sources.filter(f=>!excluded.has(f.id));
  if(sources.some(f=>f.documentId!==analysis.documentId))throw new Error("Análisis sin respaldo: documento distinto al catálogo de fuentes.");
  const items=[...analysis.learningObjectives,...analysis.keyConcepts,...analysis.sections,...analysis.importantFacts,...analysis.relationships];
  for(const group of [analysis.learningObjectives,analysis.keyConcepts,analysis.sections,analysis.importantFacts,analysis.relationships]) {
    if(new Set(group.map(i=>i.id)).size!==group.length) throw new Error("El análisis contiene identificadores duplicados.");
  }
  for(const ref of [...analysis.sourceReferences,...items.flatMap(i=>i.sourceReferences)]) {
    const error=referenceProblem(ref,usable);if(error) throw new Error(`Análisis sin respaldo: ${error}`);
  }
  for(const item of [analysis,...items])resolveSourceIds(item.sourceFragmentIds,usable,analysis.documentId);
}
