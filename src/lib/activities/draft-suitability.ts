import {z} from "zod";
import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";
import {selectCoherentEvidence} from "./activity-knowledge";

/** Suitability is an advisory, never a replacement for source/structure validation. */
export const draftSuitabilitySchema=z.object({level:z.enum(["partial","weak"]),message:z.string().min(1).max(700)}).strict();
export const timelineAdvisory="Este PDF no parece ideal para generar automáticamente una línea de tiempo. Preparamos un recorrido temático editable, sin fechas ni orden atribuidos al documento. Revísalo antes de compartirlo; puedes definir después un orden docente.";
export const simulationAdvisory="Este PDF no contiene decisiones con consecuencias explícitas suficientes. Preparamos una simulación exploratoria con situaciones de reflexión basadas en el contenido, sin inventar resultados ni asignar una nota. Revisa y ajusta el borrador antes de compartirlo.";

/** Canonical excerpts only; no LLM, invented facts or administrative fallback. */
export function academicDraftIdeas(sources:SourceFragment[]){
 const seen=new Set<string>();
 return selectCoherentEvidence(sources).flatMap(({source:f,text})=>{
  const passages=text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/).map(s=>s.trim()).filter(s=>s.length>=45&&/[.!?]$/.test(s)&&!/(?:\b(?:de|del|la|los|para|mediante|y|en))\s*[.!?]?$/i.test(s));
  return passages.map(text=>({text:text.slice(0,950),source:f}));
 }).filter(({text})=>{const key=canonical(text);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,20);
}
