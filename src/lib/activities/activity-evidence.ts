import type {SourceFragment} from "../content/schema";
import {canonical} from "../content/text";

/** Activity-specific projection. Canonical IDs/text and Quiz/Roulette normalization remain untouched. */
export function administrativeEvidence(text:string){
 return /(?:^|\n)\s*(?:resultado(?:s)? de aprendizaje(?: de la unidad)?|planificaci[oó]n acad[eé]mica|bibliograf[ií]a oficial|contenidos oficiales|c[oó]digo\s*:|asignatura\s*:|docente\s*:|duraci[oó]n\s*:|universidad\b)/i.test(text)
  || /(?:\b\d+\s*h(?:oras?)?\s+(?:aut[oó]nomo|docencia|pr[aá]ctica)|\((?:CPAE|CTA|CD|AA)\)\s*[•·])/i.test(text);
}
export function activityText(source:SourceFragment){
 if(source.contentType!=="academic"||administrativeEvidence(source.text))return "";
 const lines=source.text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
 // Drop isolated titles, never the supporting prose following them.
 return lines.filter((line,i)=>!(line.length<150&&!/[.!?;:]$/.test(line)&&!/^\(?\d+[.)]/.test(line)&&(line===line.toLocaleUpperCase("es")||i===0&&lines.length>1&&/^(?:fases|etapas|innovaci[oó]n|metodolog[ií]a|caracter[ií]sticas)\b/i.test(line)))).join(" ").replace(/\s+/g," ").trim();
}
export function evidenceHeading(source:SourceFragment){
 const first=source.text.split("\n")[0].trim();
 return first.length<120&&/^(?:fases|etapas|proceso|procedimiento|innovaci[oó]n|metodolog[ií]a)\b/i.test(first)?first:source.sectionHeading;
}
const stop=new Set("para como donde cuando sobre entre desde hasta esta este estos estas una unas unos los las del con por que sus sin al una mediante cada segun ante antes luego fuente material documento situacion didactica aplicacion interpretacion evidencia indica propuesta ejercicio es son ser se el la de y en un lo su ha no si o a mas mismo misma permite puede debe tienen tiene tambien cual cuales decisiones decision recorrido texto contenido referencia".split(" "));
export function evidenceTerms(text:string){return new Set(canonical(text).split(" ").filter(w=>w.length>3&&!stop.has(w)));}
export function overlap(a:string,b:string){const x=evidenceTerms(a),y=evidenceTerms(b);return [...x].filter(t=>y.has(t)).length;}
export function rankActivityEvidence(sources:SourceFragment[]){
 const seen=new Set<string>();return sources.flatMap(source=>{
  const text=activityText(source),key=canonical(text);if(text.length<45||seen.has(key)||!/[.!?;:]|\betapas?\b/i.test(text))return [];seen.add(key);
  const terms=evidenceTerms(text),process=/\b(?:etapas?|fases?|pasos?|secuenciales?|procedimiento|primero|finalmente)\b/i.test(text),problem=/\b(?:problema|obst[aá]culo|riesgo|error|falta de|agot[oó]|fragmentaci[oó]n|fall[ao]|desincroniz\w*|dificultad|insuficiencia|p[eé]rdida|deterioro|escasez|anomal[ií]a|da[nñ]o|impide|no puede)\b/i.test(text),solution=/\b(?:garantiza|permite|evita|reduce|soluci[oó]n|integra(?:n)?|mejora|asegura|previene|protege|restablece|disminuye)\b/i.test(text);
  const score=Math.min(terms.size,60)+Number(process)*25+Number(problem&&solution)*50+Number(/[.!?]$/.test(text))*8-Number(text.length<90)*20;
  return [{source,text,heading:evidenceHeading(source),score,process,problem,solution}];
 }).sort((a,b)=>b.score-a.score||a.source.page-b.source.page||a.source.id.localeCompare(b.source.id));
}
/** Traceability plus a conservative lexical guard, not a proof of semantic entailment. */
export function relatedToEvidence(text:string,refs:SourceFragment[]){const size=evidenceTerms(text).size;return size>=2&&overlap(text,refs.map(f=>activityText(f)).join(" "))>=2;}
