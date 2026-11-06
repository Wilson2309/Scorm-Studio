import { extractedDocumentSchema, type ExtractedDocument } from "../quiz/schema";
import { normalizedDocumentSchema, type NormalizedDocument, type SourceFragment } from "./schema";

import {canonical,normalizedSourceText} from "./text";
export {canonical} from "./text";

export function normalizeDocument(input: ExtractedDocument, minimumAcademicLength=80): NormalizedDocument {
  const doc = extractedDocumentSchema.parse(input);
  // Never infer page numbers from a concatenated string for a multi-page document.
  const pages = doc.pageTexts ?? (doc.pages === 1 ? [{ page:1, text:doc.text }] : []);
  if (!pages.length) throw new Error("Vuelve a extraer el PDF para conservar las referencias de página.");
  const documentId=createHash("sha256").update(JSON.stringify(pages.map(p=>({page:p.page,text:normalizedSourceText(p.text)})))).digest("hex");
  const lines = pages.map(p => ({...p, lines:p.text.split(/\n+/).map(s=>s.trim()).filter(Boolean)}));
  const furnitureKey=(s:string)=>canonical(s.replace(/p[aá]gina\s+\d+\s+de\s+\d+\s*$/i,""));
  const edgePages = new Map<string, Set<number>>();
  for (const p of lines) p.lines.forEach((line,i) => {
    if (i<3 || i>=p.lines.length-3) { const key=furnitureKey(line); const seen=edgePages.get(key)??new Set();seen.add(p.page);edgePages.set(key,seen); }
  });
  const fragments: SourceFragment[] = [], excluded: NormalizedDocument["excluded"] = [];
  const duplicates = new Set<string>();
  let section = "Contenido";
  for (const p of lines) {
    let index=0,administrativeSection=false;
    for (const [lineIndex,line] of p.lines.entries()) {
      const key=canonical(line);
      const edge=lineIndex<3 || lineIndex>=p.lines.length-3;
      let reason="";
      if(/^\d+\.\d+\.?\s+[A-ZÁÉÍÓÚÑ]/u.test(line))administrativeSection=false;
      if(/^Componente\s+Horas\s+Actividades de Aprendizaje|^Bibliograf[ií]a Oficial del S[ií]labo/i.test(line))administrativeSection=true;
      if(administrativeSection)reason="Bloque administrativo de dosificación o bibliografía del sílabo";
      else if (/^(?:p[aá]gina\s*)?\d{1,3}(?:\s*(?:de|\/)\s*\d{1,3})?$/i.test(line)) reason="Numeración aislada";
      else if (doc.pages>1 && edge && (edgePages.get(furnitureKey(line))?.size??0)>=Math.max(2,Math.ceil(doc.pages*.5)) && line.length<180) reason="Cabecera o pie repetido en varias páginas";
      else if(line.length<240&&/^duraci[oó]n\s+de\s+la\s+unidad\s*\d+\s*:/i.test(line)&&/\d+\s*horas?.*(?:docencia|pr[aá]cticas|CD|CPAE)/i.test(line))reason="Duración administrativa de la unidad";
      else if(line.length<180&&/^\d+\s*horas?\s*:/i.test(line)&&/\b(?:CD|CPAE|AA)\b/.test(line))reason="Distribución administrativa de horas";
      else if(/^Componente\s+Horas\s+Actividades de Aprendizaje/i.test(line))reason="Tabla administrativa de carga horaria";
      else if (line.length<220 && /^(?:docente|profesor[a]?|correo|e-?mail|tel[eé]fono|c[oó]digo de asignatura|nombre (?:del curso|de la asignatura)|asignatura|periodo acad[eé]mico|cr[eé]ditos|carrera|modalidad|sede|horas lectivas|carga horaria)\s*[:：]/i.test(line)) reason="Campo administrativo etiquetado";
      else if (line.length<100 && /^duraci[oó]n\s*[:：].*\d.*horas?\b/i.test(line) && p.lines.slice(Math.max(0,lineIndex-2),lineIndex+2).some(s=>/^(?:docente|profesor|universidad|asignatura)\b/i.test(s))) reason="Duración en contexto de ficha administrativa";
      else if (lineIndex<4 && line.length<110 && /^(?:universidad|facultad|dossier|ficha de asignatura)\b/i.test(line) && (!/[.!?]$/.test(line) || line===line.toUpperCase())) reason="Identificación institucional o del dossier";
      else if (line.length<160 && /(?:@\S+\.|\b(?:tel|contacto)\s*[:.])/i.test(line)) reason="Dato de contacto breve";
      else if (/^[\W_]+$/u.test(line)) reason="Elemento decorativo";
      else if (duplicates.has(key)) reason="Línea duplicada; se conserva su primera aparición";
      else if (line.length<15 && !/[.!?:]$/.test(line)) { section=line.slice(0,240);reason="Fragmento aislado o título breve; se conserva como contexto de sección"; }
      if (!reason && line.length<160 && (/^(?:\d+(?:\.\d+)*\.?\s+\S|unidad\s+\d+|tema\s+\d+)/i.test(line)||line===line.toUpperCase()&&/\p{L}/u.test(line))) { section=line.slice(0,240); }
      // Split long extracted paragraphs at sentence boundaries; retain the exact source slices.
      const parts = line.match(/[^.!?]*[.!?]+|[^.!?]+$/gu) ?? [line];
      let group="";
      const emit=(original:string) => {
        // Hard bound only for a pathological sentence, explicitly retained as a source slice.
        for(let offset=0;offset<original.length;offset+=2200) {
          const text=original.slice(offset,offset+2200).trim();if(!text) continue;
          const contentType:SourceFragment["contentType"]=!reason?"academic":/administrativ[oa]|institucional|dossier|contacto/i.test(reason)?"administrative":/Cabecera|Numeración/.test(reason)?"furniture":/duplicada/.test(reason)?"duplicate":/decorativo/.test(reason)?"decorative":"fragment";
          const fragment={id:`p${p.page}-f${++index}`,page:p.page,section,text,original:text,documentId,normalizedText:normalizedSourceText(text),sectionHeading:section,contentType};
          if(reason) excluded.push({...fragment,reason}); else fragments.push(fragment);
        }
      };
      for(const part of parts) { if(group.length+part.length>2200) {emit(group);group="";}group+=part; }
      if(group) emit(group);
      if(!reason) duplicates.add(key);
    }
  }
  if(!fragments.some(f=>f.text.length>minimumAcademicLength)) throw new Error("No hay suficiente contenido académico después de separar los datos administrativos.");
  // Reconstruct compact academic passages rather than sending one fragment per
  // visual PDF line. Exclusions form boundaries; no source text is invented.
  const grouped:SourceFragment[]=[];
  for(const fragment of fragments){
    const previous=grouped.at(-1),oldIndex=(f:SourceFragment)=>Number(f.id.split("-f")[1]);
    const separated=previous&&excluded.some(e=>e.page===fragment.page&&oldIndex(e)>oldIndex(previous)&&oldIndex(e)<oldIndex(fragment));
    if(previous&&previous.page===fragment.page&&!/[.!?]$/.test(previous.text)&&!separated&&previous.text.length+fragment.text.length<900){
      previous.text+=`\n${fragment.text}`;previous.original+=`\n${fragment.original}`;previous.normalizedText=normalizedSourceText(previous.text);
    }else grouped.push({...fragment});
  }
  const ordered=[...grouped,...excluded].sort((a,b)=>a.page-b.page||Number(a.id.split("-f")[1])-Number(b.id.split("-f")[1]));
  const counters=new Map<number,number>();for(const f of ordered){const n=(counters.get(f.page)??0)+1;counters.set(f.page,n);f.id=`p${f.page}-f${String(n).padStart(3,"0")}`;}
  return normalizedDocumentSchema.parse({documentId,name:doc.name,pages:doc.pages,fragments:grouped,excluded});
}

export function chunkDocument(doc: NormalizedDocument, limit=20_000) {
  const chunks: SourceFragment[][]=[];let chunk:SourceFragment[]=[],size=0;
  for(const f of doc.fragments) {
    if(size+f.text.length>limit && chunk.length){chunks.push(chunk);chunk=[];size=0;}
    chunk.push(f);size+=f.text.length;
  }
  if(chunk.length) chunks.push(chunk);
  if(chunks.length>24) throw new Error("El documento supera el presupuesto de análisis (24 bloques). Usa una unidad más acotada.");
  return chunks;
}
import { createHash } from "node:crypto";
