import {activityPresentation} from "./activity-presentation";
import {recommendTimelineAssessment} from "./timeline-assessment";
import {academicDraftIdeas,timelineAdvisory} from "./draft-suitability";
import {activityText,evidenceHeading,rankActivityEvidence} from "./activity-evidence";
import {buildActivityKnowledge,conceptTitle} from "./activity-knowledge";
import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";
import {dateBounds,type TimelineSpec,type TimelineEvent,type TimelineMode} from "./timeline-schema";

export type TimelineCandidate={mode:TimelineMode;events:TimelineEvent[];evidence:string;section:string};
const months=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function datesIn(text:string){
 const found:{label:string;start:string;end:string|null;index:number}[]=[];
 const pattern=/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+([12]\d{3})\b|\b(\d{1,2})[/-](\d{1,2})[/-]([12]\d{3})\b|\b([12]\d{3})\s*[-–—]\s*([12]\d{3})\b|\b([12]\d{3})\b(?!-\d{2}\b)|\b([12]\d{3})-(\d{2})-(\d{2})\b|\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?([12]\d{3})\b|\b([12]\d{3})-(\d{2})\b|\b(\d{1,2})\/([12]\d{3})\b/gi;
 for(const m of text.matchAll(pattern)){
  // Four digits alone can be money, bit depth or quantity. Require a temporal cue.
  if(m[9]&&m.index!>0&&!/\b(?:en|año|ano|desde|hasta|durante)\s*$/i.test(text.slice(Math.max(0,m.index!-18),m.index!)))continue;
  if(/^[\s]*(?:bits?|tokens?|horas?|usuarios?|personas?|d[oó]lares?|euros?|a[nñ]os?|productos?|registros?|clientes?|visitas?|tickets?|unidades?|MB|GB)\b/i.test(text.slice(m.index!+m[0].length)))continue;
  const start=m[17]?`${m[18]}-${m[17].padStart(2,"0")}`:m[15]?`${m[15]}-${m[16]}`:m[13]?`${m[14]}-${String(months.indexOf(m[13].toLowerCase())+1).padStart(2,"0")}`:m[10]?`${m[10]}-${m[11]}-${m[12]}`:m[1]?`${m[3]}-${String(months.indexOf(m[2].toLowerCase())+1).padStart(2,"0")}-${m[1].padStart(2,"0")}`:m[4]?`${m[6]}-${m[5].padStart(2,"0")}-${m[4].padStart(2,"0")}`:m[7]||m[9],end=m[8]||null;
  if(dateBounds(start)!==null&&(!end||dateBounds(end,true)!>=dateBounds(start)!))found.push({label:m[0],start,end,index:m.index!});
 }
 return found;
}
const clean=(text:string)=>text.replace(/^\s*[-•]\s*/,"").trim();
const short=(text:string)=>{
 let value=clean(text).replace(/[.!?].*$/,"").replace(/^(?:el equipo|la organización|la institución)\s+/i,"");
 const core=value.split(/\s+(?:mediante|para|a través de|durante|utilizando|con el fin de)\s+/i)[0];if(core.length>=12)value=core;
 const words=value.split(/\s+/);let label="";for(const word of words.slice(0,10)){if((label+" "+word).length>85)break;label+=(label?" ":"")+word;}
 label=label.replace(/(?:\s+(?:de|del|en|para|y|con|el|la|los|las|un|una))+$/i,"");return label.charAt(0).toUpperCase()+label.slice(1);
};
export function detectTimelines(sources:SourceFragment[]){
 const index=buildActivityKnowledge(sources),eligible=new Set(index.nodes.filter(n=>n.evidenceStatus!=="excluded").map(n=>n.id));
 const academic=sources.filter(f=>eligible.has(f.id)&&activityText(f)).map(f=>({...f,sectionHeading:evidenceHeading(f)})),candidates:TimelineCandidate[]=[];
 const chronological:TimelineEvent[]=[];
 for(const f of academic){
  // Sentence/list boundaries preserve the date with its own event; no external knowledge.
  const parts=f.text.split(/\n|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ0-9])/);
  for(let i=0;i<parts.length;i++){const text=clean(parts[i]),dates=datesIn(text);if(dates.length!==1||text.length<24)continue;const date=dates[0];
   // A date attached explicitly to bibliographic access is metadata, not an event.
   if(/(?:fecha de (?:consulta|acceso)|consulta realizada(?:\s+para\s+[^.!?\n]{1,45}?)?|consultado|accedido|recuperado)\s*(?:en|el)?\s*[:,-]?\s*$/i.test(text.slice(Math.max(0,date.index-70),date.index)))continue;
   const narrative=clean(text.replace(date.label,"").replace(/^\s*(?:en|desde|durante|año|el)?\s*[:;,–—-]?\s*/i,""));if(narrative.length<16)continue;
   chronological.push({id:`tl-${f.id}-${i}`,title:short(narrative),description:text.slice(0,1200),position:0,date:{label:date.label,start:date.start,end:date.end},sourceFragmentIds:[f.id],provenance:"source",ordinal:null});
  }
 }
 const unique=chronological.filter((e,i,a)=>a.findIndex(x=>canonical(x.description)===canonical(e.description))===i).sort((a,b)=>dateBounds(a.date!.start)!-dateBounds(b.date!.start)!);
 if(unique.length>=2)candidates.push({mode:"CHRONOLOGICAL_TIMELINE",events:unique.slice(0,20).map((e,i)=>({...e,position:i})),section:"Acontecimientos fechados",evidence:`${unique.length} acontecimientos con fecha explícita en el material.`});
 const groups=new Map<string,TimelineEvent[]>();
 for(const f of academic){
  // Parenthesized stages in wrapped prose are common in textbooks. Only an
  // explicit sequential cue, never numbering alone, establishes process order.
  const text=activityText(f),numbers=[...text.matchAll(/\((\d{1,2})\)\s*/g)];
  if(numbers.length>=2&&/\b(?:etapas?|fases?|pasos?|secuenciales?|procedimiento)\b/i.test(text.slice(Math.max(0,numbers[0].index!-160),numbers[0].index))&&numbers.every((m,i)=>Number(m[1])===i+1)){
   const stages=numbers.map((m,i)=>{const description=text.slice(m.index!+m[0].length,numbers[i+1]?.index??text.length).trim().replace(/;\s*(?:y\s*)?$/i,"").replace(/\s+([.;])/g,"$1");return {id:`tl-${f.id}-inline${i}`,title:short(description),description,position:i,date:null,sourceFragmentIds:[f.id],provenance:"source" as const,ordinal:i+1};});
   if(stages.every(e=>e.description.length>=20))candidates.push({mode:"PROCESS_TIMELINE",events:stages.slice(0,20),section:f.sectionHeading,evidence:`${stages.length} etapas consecutivas en una secuencia explícita del material.`});
  }
  const markers=[...f.text.matchAll(/\b(Primero|En primer lugar|Luego|Después|A continuación|Finalmente|Por último)\s*[:,]?\s*/gi)];
  if(markers.length>=3&&/^(primero|en primer lugar)$/i.test(markers[0][1])&&/^(finalmente|por último)$/i.test(markers.at(-1)![1])){
   const stages=markers.map((m,i)=>{const description=f.text.slice(m.index!,markers[i+1]?.index??f.text.length).trim();return {id:`tl-${f.id}-m${i}`,title:short(description.replace(m[0],"")),description:description.slice(0,1200),position:i,date:null,sourceFragmentIds:[f.id],provenance:"source" as const,ordinal:i+1};});
   if(stages.every(e=>e.title.length>=12))candidates.push({mode:"PROCESS_TIMELINE",events:stages.slice(0,20),section:f.sectionHeading,evidence:"Secuencia explícita: primero, etapas intermedias y cierre en el mismo fragmento."});
  }
  const heading=f.sectionHeading||f.section,parts=f.text.split(/\n|(?=\b(?:Paso|Etapa|Fase)\s+\d+\s*[:.)–-])/i);
  for(let i=0;i<parts.length;i++){const text=clean(parts[i]),explicit=/^(?:Paso|Etapa|Fase)\s+(\d+)\s*[:.)–-]\s*(.+)/i.exec(text),numbered=/^(\d+)\s*[.)]\s+(.+)/.exec(text);
   const m=explicit||(/\b(proceso|procedimiento|secuencia|etapas|fases|pasos|protocolo)\b/i.test(heading)?numbered:null);if(!m||m[2].length<12)continue;
   const key=heading||"Proceso explícito",events=groups.get(key)||[];events.push({id:`tl-${f.id}-p${i}`,title:short(m[2]),description:text.slice(0,1200),position:0,date:null,sourceFragmentIds:[f.id],provenance:"source",ordinal:Number(m[1])});groups.set(key,events);
  }
 }
 for(const [section,events] of groups){const sorted=events.sort((a,b)=>a.ordinal!-b.ordinal!),ordinals=sorted.map(e=>e.ordinal!);if(sorted.length<2||new Set(ordinals).size!==sorted.length||ordinals[0]!==1||ordinals.some((n,i)=>n!==i+1))continue;
  candidates.push({mode:"PROCESS_TIMELINE",events:sorted.slice(0,20).map((e,i)=>({...e,position:i})),section,evidence:`${sorted.length} etapas numeradas consecutivamente en «${section}».`});
 }
 for(const c of candidates)c.events=c.events.map(e=>{
  if(c.events.filter(other=>canonical(other.title)===canonical(e.title)).length<2)return e;
  const label=c.mode==="PROCESS_TIMELINE"?`Etapa ${e.position+1} · ${e.title}`:`${e.title} · ${e.date!.label}`;
  return {...e,title:label.length<=100?label:`Acontecimiento ${e.date!.label}`};
 });
 const ranking=rankActivityEvidence(sources),score=(c:TimelineCandidate)=>c.events.length*20+Math.max(0,...ranking.filter(r=>c.events.some(e=>e.sourceFragmentIds.includes(r.source.id))).map(r=>r.score));
 candidates.sort((a,b)=>score(b)-score(a));return {candidates,recommended:candidates[0]?.mode??null,reason:candidates.length?"Hay evidencia verificable para preparar un recorrido.":"No se encontraron al menos dos acontecimientos con fecha o etapas con orden explícito. Una lista de características no demuestra una secuencia."};
}
export function timelineProposal(sources:SourceFragment[],mode?:TimelineMode){
 const detection=detectTimelines(sources),matching=detection.candidates.find(c=>!mode||c.mode===mode);
 if(matching)return {candidate:matching,preparation:undefined};
 if(detection.candidates.length&&mode!=="CONCEPTUAL_TIMELINE")return {candidate:detection.candidates[0],preparation:{level:"partial" as const,message:"La modalidad elegida no tiene evidencia suficiente. Usamos la modalidad respaldada por este documento; revísala y ajústala en el editor."}};
 const ideas=academicDraftIdeas(sources);if(!ideas.length)return {candidate:null,preparation:undefined};
 const events:TimelineEvent[]=ideas.slice(0,5).map(({text,source},i)=>({id:`tl-${source.id}-topic${i}`,title:conceptTitle(text),description:text,position:i,date:null,sourceFragmentIds:[source.id],provenance:"source",ordinal:null}));
 if(events.length===1)events.push({...events[0],id:events[0].id+"-review",title:"Relaciona y revisa lo aprendido",description:`Vuelve a la fuente y explica con tus palabras la idea trabajada: ${events[0].description}`.slice(0,1200),position:1});
 return {candidate:{mode:"CONCEPTUAL_TIMELINE" as const,section:"Exploración conceptual",evidence:"Hitos temáticos relacionados. Este recorrido no representa una cronología ni un proceso ordenado.",events},preparation:{level:"weak" as const,message:timelineAdvisory}};
}
export function prepareTimeline(sources:SourceFragment[],documentId:string,id:string,title:string,mode?:TimelineMode,count=20):TimelineSpec{
 const {candidate,preparation}=timelineProposal(sources,mode);
 if(!candidate)throw Error("No hay contenido académico legible para preparar un recorrido. Cambia el PDF o añade contenido docente.");
 const spec:TimelineSpec={id,type:"TIMELINE",schemaVersion:1,documentId,title:title.slice(0,100),...(preparation?{preparation}:{}),description:preparation?.level==="weak"?"Recorrido temático propuesto para explorar y relacionar las ideas del material. Su orden es una propuesta de lectura, no un proceso documentado.":candidate.mode==="CHRONOLOGICAL_TIMELINE"?"Recorre los acontecimientos del material y relaciona sus fechas para comprender su evolución.":"Conoce cada etapa y descubre su lugar dentro del procedimiento descrito en el material.",instructions:"Explora los hitos, consulta su evidencia y completa el recorrido de aprendizaje.",mode:candidate.mode,events:candidate.events.slice(0,Math.max(2,Math.min(20,count))).map((e,i)=>({...e,title:activityPresentation(e.title),description:activityPresentation(e.description),position:i})),configuration:{presentation:"auto",showEventDetails:true,allowBackNavigation:true,requireAllEventsVisited:true,enableFeedback:true,allowRetry:true,maxAttempts:2},assessment:{mode:"EXPLORATORY",passingScore:70,orderBasis:preparation?.level==="weak"?"none":"source",teacherOrderConfirmed:false}};
 const recommendation=recommendTimelineAssessment(spec);spec.assessment.mode=recommendation.mode;if(recommendation.mode==="ORDERING")spec.instructions="Explora los hitos y sus fuentes. Después ordénalos según el material y confirma tu respuesta para recibir calificación y feedback.";return spec;
}
