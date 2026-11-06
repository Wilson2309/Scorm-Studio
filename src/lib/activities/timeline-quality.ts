import {canonical} from "../content/text";
import type {SourceFragment} from "../content/schema";
import {timelineSpecSchema,dateBounds,type TimelineIssue,type TimelineConstraint} from "./timeline-schema";
import {detectTimelines,datesIn} from "./timeline-detection";
import {administrativeEvidence,relatedToEvidence} from "./activity-evidence";
import {evidenceCoherence} from "./activity-knowledge";

export {timelineConstraints} from "./timeline-assessment";
import {timelineConstraints} from "./timeline-assessment";

export function validateTimeline(input:unknown,sources:SourceFragment[],documentId?:string){
 const issues:TimelineIssue[]=[],add=(severity:TimelineIssue["severity"],code:string,message:string,eventId?:string)=>{issues.push({severity,code,message,...(eventId?{eventId}:{})});};
 const parsed=timelineSpecSchema.safeParse(input);if(!parsed.success){for(const e of parsed.error.issues){const event=e.path[0]==="events"&&typeof e.path[1]==="number"?`El hito ${e.path[1]+1}`:"La actividad",message=e.path[0]==="events"&&e.path.length===1?"La línea de tiempo necesita entre 2 y 20 hitos.":e.path.includes("title")?`${event} necesita un título de hasta 100 caracteres.`:e.path.includes("description")?`${event} necesita una descripción de hasta 1.200 caracteres.`:e.path.includes("date")?`${event} necesita una fecha o periodo válido.`:e.path[0]==="instructions"?"Escribe instrucciones claras de al menos 10 caracteres.":"Revisa la configuración y los datos de los hitos antes de compartir la actividad.";add("BLOCKING","structure",message);}return {valid:false,issues,status:"BLOCKING" as const,constraints:[] as TimelineConstraint[]};}
 const spec=parsed.data,ids=spec.events.map(e=>e.id),detected=detectTimelines(sources).candidates;
 if(spec.preparation)add(spec.mode==="CONCEPTUAL_TIMELINE"?"INFO":"WARNING","document_suitability",spec.preparation.message);
 if(documentId&&spec.documentId!==documentId)add("BLOCKING","document","Las fuentes no pertenecen al documento de esta actividad.");
 if(new Set(ids).size!==ids.length)add("BLOCKING","duplicate_id","Cada hito necesita una identidad diferente.");
 if(new Set(spec.events.map(e=>canonical(e.title))).size!==ids.length)add("BLOCKING","duplicate_event","Hay hitos con el mismo título. Distingue su contenido.");
 if(spec.events.some((e,i)=>e.position!==i))add("BLOCKING","position","Las posiciones deben ser consecutivas y coincidir con el orden visible.");
 for(const e of spec.events){
  const refs=e.sourceFragmentIds.map(id=>sources.find(f=>f.id===id));
  if(administrativeEvidence(e.title+"\n"+e.description))add("BLOCKING","administrative_content","Este hito utiliza metadatos académicos, no una etapa o un acontecimiento del contenido.",e.id);
  if(/^Idea\s+\d+\s*:/i.test(e.title))add("BLOCKING","generic_stage","Sustituye esta etiqueta genérica por una etapa o acontecimiento fundamentado.",e.id);
  if(/\b(?:de|del|para|mediante|con|y|en)\s*[.!?]?$/i.test(e.description))add("BLOCKING","incomplete_description","La descripción parece cortada. Recupera la oración completa de la fuente.",e.id);
  if(e.provenance!=="teacher"&&refs.every(f=>!!f)&&!relatedToEvidence(e.description,refs.filter((f):f is SourceFragment=>!!f)))add("BLOCKING","unrelated_source","La descripción no tiene suficiente relación con la evidencia citada. Revisa la fuente y el contenido.",e.id);
  if(new Set(e.sourceFragmentIds).size!==e.sourceFragmentIds.length||refs.some(f=>!f||f.documentId!==spec.documentId||f.contentType!=="academic"||f.page<1))add("BLOCKING","source","Hay una fuente inexistente, ajena o no académica.",e.id);
  if(e.provenance!=="teacher"&&!refs.length)add("BLOCKING","missing_source","Este hito automático necesita evidencia del PDF.",e.id);
  if(e.provenance==="assisted")add("INFO","assisted_wording","Redacción asistida por IA; contrasta el texto con la fuente antes de compartir.",e.id);
  if(e.provenance==="teacher")add("INFO","teacher_content","Contenido editado o añadido por el docente; no se presenta como extracción automática.",e.id);
  if(e.description.length<35)add("WARNING","brief","Amplía la descripción para explicar mejor este hito.",e.id);
  if(spec.mode==="PROCESS_TIMELINE"&&e.date)add("BLOCKING","process_date","Un proceso utiliza etapas, no fechas inventadas.",e.id);
  if(spec.mode==="CHRONOLOGICAL_TIMELINE"){
   const d=e.date;if(!d||dateBounds(d.start)===null||(d.end&&(dateBounds(d.end,true)===null||dateBounds(d.end,true)!<dateBounds(d.start)!)))add("BLOCKING","date","Revisa la fecha o el periodo del acontecimiento.",e.id);
   else if(!datesIn(d.label).some(x=>x.start===d.start&&x.end===d.end))add("BLOCKING","date_label","La fecha visible y los valores de inicio/fin deben representar la misma fecha o periodo.",e.id);
   else if((e.provenance!=="teacher"||spec.assessment.mode==="ORDERING"&&spec.assessment.orderBasis==="source")&&!refs.some(f=>f&&datesIn(f.text).some(x=>canonical(x.label)===canonical(d.label)&&x.start===d.start&&x.end===d.end)))add("BLOCKING","unsupported_date","La fecha no coincide con las fuentes canónicas. Usa la fecha original o define expresamente el criterio docente.",e.id);
  }
 }
 const constraints=timelineConstraints(spec);
 if(spec.mode==="CONCEPTUAL_TIMELINE"){
  if(spec.assessment.mode==="ORDERING"||spec.assessment.orderBasis!=="none"||spec.events.some(e=>e.date||e.ordinal!==null))add("BLOCKING","conceptual_order","La exploración conceptual no representa fechas ni un orden evaluable. Usa exploración sin ordenamiento.");
  const refs=sources.filter(f=>spec.events.some(e=>e.sourceFragmentIds.includes(f.id))),linked=new Set(refs.length?[refs[0].id]:[]);for(let pass=0;pass<refs.length;pass++)for(const f of refs)if(refs.some(other=>linked.has(other.id)&&evidenceCoherence({text:f.text,heading:f.sectionHeading},{text:other.text,heading:other.sectionHeading})))linked.add(f.id);
  if(refs.length>1&&linked.size!==refs.length)add("BLOCKING","disconnected_topics","Los hitos no forman una unidad temática suficientemente relacionada. Revisa la selección de fuentes.");
 }
 if(spec.mode==="PROCESS_TIMELINE"&&spec.preparation?.level==="weak"&&!(spec.assessment.orderBasis==="teacher"&&spec.assessment.teacherOrderConfirmed))add("BLOCKING","sequence_not_found","No hay una secuencia respaldada. Usa exploración conceptual o define expresamente un orden docente.");
 if(spec.assessment.mode==="ORDERING"){
  if(!constraints.length)add("BLOCKING","unsupported_order","No hay un orden evaluable. Usa exploración o define expresamente el orden docente.");
  if(spec.assessment.orderBasis==="teacher"&&!spec.assessment.teacherOrderConfirmed)add("BLOCKING","teacher_order","Confirma expresamente el orden definido por el docente.");
  if(spec.assessment.orderBasis==="source"&&spec.mode==="PROCESS_TIMELINE"&&!detected.some(c=>c.mode===spec.mode&&spec.events.every((e,i)=>{const n=c.events.find(x=>x.id===e.id);return n&&n.ordinal===e.ordinal&&(i===0||spec.events[i-1].ordinal!<e.ordinal!); })))add("BLOCKING","unsupported_process","La secuencia editada no conserva el orden explícito del PDF. Confirma un orden docente o usa exploración.");
  if(spec.assessment.orderBasis==="source"&&spec.mode==="PROCESS_TIMELINE"&&spec.events.some((e,i)=>i>0&&e.ordinal!==spec.events[i-1].ordinal!+1))add("BLOCKING","incomplete_process","Faltan etapas intermedias de la secuencia. Inclúyelas o define expresamente un recorrido docente.");
 }
 if(spec.mode==="CHRONOLOGICAL_TIMELINE")for(let i=1;i<spec.events.length;i++){const a=spec.events[i-1].date,b=spec.events[i].date;if(a&&b&&dateBounds(a.start)!>dateBounds(b.start)!)add("BLOCKING","date_order","Ordena los acontecimientos de acuerdo con sus fechas.");}
 if(spec.assessment.mode==="IDENTIFICATION"){
  if(spec.events.length<3)add("BLOCKING","identification_count","La identificación necesita al menos tres acontecimientos distintos.");
  if(new Set(spec.events.map(e=>canonical(e.description))).size!==ids.length)add("BLOCKING","ambiguous_identification","Las descripciones repetidas impiden una identificación inequívoca.");
  for(const e of spec.events)if(e.title.length>12&&canonical(e.description).includes(canonical(e.title)))add("WARNING","identification_cue","La descripción repite el título. Reformúlala para que identificar el hito requiera interpretar el contenido.",e.id);
 }
 if(spec.mode==="CHRONOLOGICAL_TIMELINE"&&constraints.length<spec.events.length-1)add("INFO","simultaneous","Hay fechas simultáneas o periodos solapados. No se impone un orden entre ellos.");
 const original=detected.find(c=>c.mode===spec.mode&&spec.events.some(e=>c.events.some(o=>o.id===e.id)));
 if(original&&spec.events.length<original.events.length)add("WARNING","partial_coverage",`El recorrido utiliza ${spec.events.length} de ${original.events.length} hitos detectados. Revisa si el alcance parcial cumple tu objetivo.`);
 const valid=!issues.some(i=>i.severity==="BLOCKING");return {valid,issues,constraints,status:valid?issues.some(i=>i.severity==="WARNING")?"WARNING" as const:"PASS" as const:"BLOCKING" as const};
}
