import {strToU8,strFromU8,zipSync,unzipSync} from "fflate";
import type {SourceFragment} from "../content/schema";
import {escapeXML} from "../scorm/template";
import {simulationSpecSchema,type SimulationSpec} from "./simulation-schema";
import {renderSimulation,simulationStyles,simulationRuntime} from "./simulation-renderer";
export const simulationAdapter={render:renderSimulation,
 package(input:SimulationSpec,sources:SourceFragment[]){const spec=simulationSpecSchema.parse(input),html=renderSimulation(spec,sources),title=escapeXML(spec.title),manifest=`<?xml version="1.0" encoding="UTF-8"?><manifest identifier="SCORM_STUDIO_SIMULATION" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="ORG"><organization identifier="ORG"><title>${title}</title><item identifier="ITEM" identifierref="SIMULATION"><title>${title}</title>${spec.configuration.scored?`<adlcp:masteryscore>${spec.configuration.passingScore}</adlcp:masteryscore>`:""}</item></organization></organizations><resources><resource identifier="SIMULATION" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/><file href="runtime.js"/><file href="styles.css"/></resource></resources></manifest>`;return zipSync({"imsmanifest.xml":strToU8(manifest),"index.html":strToU8(html),"runtime.js":strToU8(simulationRuntime),"styles.css":strToU8(simulationStyles)});},
 validate(bytes:Uint8Array,spec:SimulationSpec,sources:SourceFragment[]){
  const files=unzipSync(bytes),expected=unzipSync(this.package(spec,sources));
  // Accept precisely the previous presentation asset, not arbitrary old CSS.
  // Stored owner/revision/content integrity and every other asset remain exact.
  const matches=(name:string,data:Uint8Array)=>{
   if(!files[name])return false;const current=strFromU8(data),actual=strFromU8(files[name]);if(current===actual)return true;
   if(name==='styles.css')return actual===current.replace('.sim-score strong{display:block;font:800 clamp(2rem,8vw,4rem) Manrope;max-width:100%;overflow-wrap:anywhere}','.sim-score strong{display:block;font:800 64px Manrope}');
   if(name==='runtime.js')return actual===current.replace("view.decisions+(view.decisions===1?' decisión trabajada':' decisiones trabajadas')","view.decisions+' decisiones trabajadas'");
   if(name==='index.html')return actual===current.replace('<small>situación de decisión</small>','<small>situaciones de decisión</small>');
   return false;
  };
  if(Object.keys(files).sort().join()!==Object.keys(expected).sort().join()||Object.entries(expected).some(([name,data])=>!matches(name,data)))throw Error("El ZIP no corresponde a la revisión actual de la simulación.");
  return {html:renderSimulation(spec,sources,true),size:bytes.byteLength,paths:Object.keys(files)};
 }
};
