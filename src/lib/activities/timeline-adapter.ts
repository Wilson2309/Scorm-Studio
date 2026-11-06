import {strToU8,strFromU8,zipSync,unzipSync} from "fflate";
import type {SourceFragment} from "../content/schema";
import {escapeXML} from "../scorm/template";
import {timelineSpecSchema,type TimelineSpec} from "./timeline-schema";
import {educationalActivitySchema} from "./schema";
import {renderTimeline,timelineStyles,timelineRuntime} from "./timeline-renderer";

export const timelineAdapter={
 render:renderTimeline,
 package(input:TimelineSpec,sources:SourceFragment[]){
  const spec=timelineSpecSchema.parse(input);educationalActivitySchema.parse(spec);const html=renderTimeline(spec,sources),title=escapeXML(spec.title),scored=spec.assessment.mode!=="EXPLORATORY";
  const manifest=`<?xml version="1.0" encoding="UTF-8"?><manifest identifier="SCORM_STUDIO_TIMELINE" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="ORG"><organization identifier="ORG"><title>${title}</title><item identifier="ITEM" identifierref="TIMELINE"><title>${title}</title>${scored?`<adlcp:masteryscore>${spec.assessment.passingScore}</adlcp:masteryscore>`:""}</item></organization></organizations><resources><resource identifier="TIMELINE" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/><file href="runtime.js"/><file href="styles.css"/></resource></resources></manifest>`;
  return zipSync({"imsmanifest.xml":strToU8(manifest),"index.html":strToU8(html),"styles.css":strToU8(timelineStyles),"runtime.js":strToU8(timelineRuntime)});
 },
 validate(bytes:Uint8Array,spec:TimelineSpec,sources:SourceFragment[]){
  const files=unzipSync(bytes),expected=unzipSync(this.package(spec,sources));
  // The former label expression is valid only for pre-conceptual packages.
  // No scoring/tracking code, content or manifest difference is accepted.
  const matches=(name:string,data:Uint8Array)=>{if(!files[name])return false;const current=strFromU8(data),actual=strFromU8(files[name]);return current===actual||name==="runtime.js"&&spec.mode!=="CONCEPTUAL_TIMELINE"&&actual===current.replace("e.date?.label||(data.mode==='CONCEPTUAL_TIMELINE'?'Tema ':'Etapa ')+(state.i+1)","e.date?.label||'Etapa '+(state.i+1)");};
  if(Object.keys(files).sort().join()!==Object.keys(expected).sort().join()||Object.entries(expected).some(([name,data])=>!matches(name,data)))throw Error("El paquete no corresponde a la revisión actual de la línea de tiempo.");
  return {html:renderTimeline(spec,sources,true),size:bytes.byteLength,paths:Object.keys(files)};
 }
};
