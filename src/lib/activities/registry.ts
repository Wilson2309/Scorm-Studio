import {strToU8,strFromU8,zipSync,unzipSync} from "fflate";
import {validateQuiz,syncBlueprint} from "../content/quality";
import type {StudioQuiz} from "../content/schema";
import {packageSCORM} from "../scorm/package";
import {renderQuiz,escapeXML} from "../scorm/template";
import {validateSCORMArtifact} from "../content/scorm-artifact";
import {renderRoulette,rouletteRuntime,rouletteStyles,approvedRouletteStyles} from "./roulette-renderer";
import {rouletteSpecSchema,activityDefinition,type RouletteSpec,type ActivityType} from "./schema";
import type {TimelineSpec} from "./timeline-schema";
import type {SourceFragment} from "../content/schema";
import {validateTimeline} from "./timeline-quality";
import {timelineAdapter} from "./timeline-adapter";
import type {SimulationSpec} from "./simulation-schema";
import {validateSimulation} from "./simulation-quality";
import {simulationAdapter} from "./simulation-adapter";

export function rouletteContent(quiz:StudioQuiz,spec:RouletteSpec){
 const ids=new Set(spec.segments.map(s=>s.questionId));return syncBlueprint({...quiz,questions:quiz.questions.filter(q=>ids.has(q.id))});
}
export function validateActivity(quiz:StudioQuiz|null,spec:RouletteSpec|TimelineSpec|SimulationSpec|null,sources:SourceFragment[]=[]){
 if(spec?.type==="SIMULATION")return validateSimulation(spec,sources,spec.documentId);
 if(spec?.type==="TIMELINE")return validateTimeline(spec,sources,spec.documentId);
 if(!quiz)throw Error("No hay contenido disponible para esta actividad.");
 const issues:{severity:"BLOCKING"|"WARNING"|"INFO";message:string;questionId?:string|null}[]=[];
 if(spec){const parsed=rouletteSpecSchema.safeParse(spec);if(!parsed.success)issues.push(...parsed.error.issues.map(i=>({severity:"BLOCKING" as const,message:i.message})));
  for(const s of spec.segments)if(!quiz.questions.some(q=>q.id===s.questionId))issues.push({severity:"BLOCKING",message:`El segmento «${s.label}» no tiene un reto disponible.`});}
 if(spec)for(const q of quiz.questions.filter(q=>spec.segments.some(s=>s.questionId===q.id)))if(q.sourceFragmentIds.some(id=>quiz.sources.find(f=>f.id===id)?.contentType!=="academic"))issues.push({severity:"BLOCKING",message:"Los retos deben referirse a contenido académico disponible del PDF.",questionId:q.id});
 const content=spec?rouletteContent(quiz,spec):quiz,q=validateQuiz(content);issues.push(...q.issues.filter(i=>i.severity!=="PASS").map(i=>({severity:i.severity as "BLOCKING"|"WARNING"|"INFO",message:i.message,questionId:i.questionId})));
 return {valid:!issues.some(i=>i.severity==="BLOCKING"),issues,quality:q,content};
}
const rouletteAdapter={
 render:(quiz:StudioQuiz,spec:RouletteSpec,inline=false)=>renderRoulette(rouletteContent(quiz,spec),spec,inline),
 package(quiz:StudioQuiz,spec:RouletteSpec){
  if(!validateActivity(quiz,spec).valid)throw Error("Revisa los retos y segmentos antes de exportar.");
  activityDefinition(rouletteContent(quiz,spec),spec.id,spec);
  const title=escapeXML(quiz.title),manifest=`<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="SCORM_STUDIO_ROULETTE" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="ORG"><organization identifier="ORG"><title>${title}</title><item identifier="ITEM" identifierref="ROULETTE"><title>${title}</title>${quiz.scored?`<adlcp:masteryscore>${quiz.passingScore}</adlcp:masteryscore>`:""}</item></organization></organizations><resources><resource identifier="ROULETTE" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/><file href="runtime.js"/><file href="styles.css"/></resource></resources></manifest>`;
  return zipSync({"imsmanifest.xml":strToU8(manifest),"index.html":strToU8(this.render(quiz,spec)),"runtime.js":strToU8(rouletteRuntime),"styles.css":strToU8(rouletteStyles)});
 }
};
export const activityAdapters={QUIZ:{render:(quiz:StudioQuiz,_spec?:null,inline=false)=>renderQuiz(quiz,inline),package:packageSCORM},ROULETTE:rouletteAdapter,TIMELINE:timelineAdapter,SIMULATION:simulationAdapter} as const;
export function registeredActivity(type:ActivityType){return activityAdapters[type];}
export function renderActivity(quiz:StudioQuiz|null,spec:RouletteSpec|TimelineSpec|SimulationSpec|null,inline=true,sources:SourceFragment[]=[]){if(spec?.type==="SIMULATION")return simulationAdapter.render(spec,sources,inline);if(spec?.type==="TIMELINE")return timelineAdapter.render(spec,sources,inline);if(!quiz)throw Error("Falta contenido de la actividad.");return spec?rouletteAdapter.render(quiz,spec,inline):renderQuiz(quiz,inline);}
export function packageActivity(quiz:StudioQuiz|null,spec:RouletteSpec|TimelineSpec|SimulationSpec|null,sources:SourceFragment[]=[]){if(spec?.type==="SIMULATION")return simulationAdapter.package(spec,sources);if(spec?.type==="TIMELINE")return timelineAdapter.package(spec,sources);if(!quiz)throw Error("Falta contenido de la actividad.");return spec?rouletteAdapter.package(quiz,spec):packageSCORM(quiz);}
export function validateActivityArtifact(bytes:Uint8Array,quiz:StudioQuiz|null,spec:RouletteSpec|TimelineSpec|SimulationSpec|null,sources:SourceFragment[]=[]){
 if(spec?.type==="SIMULATION")return simulationAdapter.validate(bytes,spec,sources);
 if(spec?.type==="TIMELINE")return timelineAdapter.validate(bytes,spec,sources);
 if(!quiz)throw Error("Falta contenido de la actividad.");
 if(!spec)return validateSCORMArtifact(bytes,quiz);
 const files=unzipSync(bytes),expected=unzipSync(packageActivity(quiz,spec));
 if(Object.keys(files).sort().join()!==Object.keys(expected).sort().join()||Object.entries(expected).some(([k,v])=>!files[k]||(k==="styles.css"?!approvedRouletteStyles.some(css=>css===strFromU8(files[k])):strFromU8(files[k])!==strFromU8(v))))throw Error("El paquete no corresponde a la revisión actual de la ruleta.");
 const html=strFromU8(files["index.html"]).replace('<link rel="stylesheet" href="styles.css">',()=>`<style>${strFromU8(files["styles.css"])}</style>`).replace('<script src="runtime.js"></script>',()=>`<script>${rouletteRuntime}</script>`);
 return {html,size:bytes.byteLength,paths:Object.keys(files)};
}
