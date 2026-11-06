import "server-only";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {WorkspacePort} from "./port";
import {documentRowSchema,generationRowSchema,revisionRowSchema,packageRowSchema,operationSchema,workspaceId,hydrateQuiz,dehydrateQuiz,persistedDraftSchema,readActivityDraft,persistedRouletteDraftSchema,type WorkspaceSnapshot,type WorkspaceGeneration,type WorkspacePackage} from "./contracts";
import {WorkspaceError} from "./errors";
import {sha256,sealPrepared,openPrepared} from "./seal.server";
import {extractPDF} from "../pdf/extract";
import {quizConfigSchema} from "../quiz/schema";
import {InsufficientAcademicContentError} from "../content/deterministic-analysis.server";
import {prepareDocumentForActivities} from "../activities/document-preparation.server";
import {buildHybridPlan} from "../content/hybrid-plan";
import {generateHybridQuiz,regenerateHybridQuestion} from "../content/hybrid-pipeline.server";
import type {ContentIntelligenceProvider} from "../content/provider-contract";
import type {HybridPrepared} from "../content/hybrid-schema";
import type {StudioQuiz} from "../content/schema";
import {validateQuiz,syncBlueprint} from "../content/quality";
import {compilePedagogicalQuiz} from "../content/pedagogical-compiler";
import {packageActivity,validateActivity,validateActivityArtifact} from "../activities/registry";
import {rouletteFromQuiz,rouletteSpecSchema} from "../activities/schema";
import {persistedTimelineDraftSchema} from "./contracts";
import {editableTimelineSchema,timelineModeSchema} from "../activities/timeline-schema";
import {prepareTimeline,datesIn} from "../activities/timeline-detection";
import {validateTimeline} from "../activities/timeline-quality";
import {timelineWordingSchema} from "../activities/timeline-wording";
import {editableSimulationSchema} from "../activities/simulation-schema";
import {prepareSimulation} from "../activities/simulation-detection";
import {detectSimulationCases} from "../activities/simulation-planning";
import {writeSimulationCase} from "../activities/simulation-case-generation";
import {validateSimulation} from "../activities/simulation-quality";
import {persistedSimulationDraftSchema} from "./contracts";

export class PendingDraftError extends WorkspaceError{
 constructor(readonly recovery:{quiz:StudioQuiz;operationId:string;generationId:string}){super(503,"result_not_saved","Las preguntas están redactadas, pero su guardado no terminó. Consérvalas y reintenta guardar; no necesitas otra inferencia.");}
}
const missing=()=>new WorkspaceError(404,"not_found","La actividad no está disponible en tu cuenta.");
export class WorkspaceService{
 constructor(readonly port:WorkspacePort,readonly owner:string,readonly provider:()=>ContentIntelligenceProvider){workspaceId.parse(owner);}
 private async generation(id:string){
  const row=(await this.port.read("generations",{id:workspaceId.parse(id),user_id:this.owner}))[0];if(!row)throw missing();
  const g=generationRowSchema.parse(row);if(g.user_id!==this.owner||g.deleting_at)throw missing();return g;
 }
 private async document(id:string){
  const row=(await this.port.read("documents",{id:workspaceId.parse(id),user_id:this.owner}))[0];if(!row)throw missing();
  const d=documentRowSchema.parse(row);if(d.user_id!==this.owner||d.deleting_at)throw missing();
  if(d.storage_path!==`${this.owner}/${d.id}/original.pdf`)throw missing();return d;
 }
 private async preparation(g:WorkspaceGeneration){const d=await this.document(g.document_id);if(d.status!=="PREPARED")throw new WorkspaceError(409,"not_prepared","El PDF todavía no está preparado.");return {d,prepared:openPrepared(this.owner,d.id,d.file_sha256,d.prepared_json)};}
 private async revision(g:WorkspaceGeneration,revision=g.current_revision){
  if(!revision)return null;const row=(await this.port.read("quiz_revisions",{generation_id:g.id,user_id:this.owner,revision}))[0];if(!row)throw missing();return revisionRowSchema.parse(row);
 }
 private canonicalQuiz(input:unknown,prepared:HybridPrepared){
  return hydrateQuiz(persistedDraftSchema.parse({version:1,quiz:input,sourceIds:prepared.document.fragments.map(f=>f.id)}),prepared);
 }
 private summary(quiz:StudioQuiz){const q=validateQuiz(quiz);return {ready:q.valid,summary:{valid:q.valid,ready:q.validCount,blocking:q.blockingQuestionCount,warnings:q.issues.filter(i=>i.severity==="WARNING").length},
  validation:{valid:q.valid,reviewState:q.valid?"READY" as const:"NEEDS_REVIEW" as const,issues:q.issues.map(i=>({severity:i.severity,code:i.code,title:i.title,message:i.message,questionId:i.questionId}))}};}
 async snapshot(id:string):Promise<WorkspaceSnapshot>{
  const g=await this.generation(id),{d,prepared}=await this.preparation(g),r=await this.revision(g);
  let current:WorkspacePackage|null=null;
  if(g.current_package_id){const p=(await this.port.read("scorm_packages",{id:g.current_package_id,user_id:this.owner,generation_id:g.id}))[0];if(p){const parsed=packageRowSchema.parse(p);if(parsed.status==="READY"&&parsed.revision===g.current_revision)current=parsed;}}
  const {prepared_json:sealed,...document}=d;void sealed;
  const draft=r?readActivityDraft(r.draft_json,prepared):null;
  if(draft?.activity&&(draft.activity.id!==g.id||g.activity_type!=="ROULETTE"))throw missing();
  if(draft?.simulation&&(draft.simulation.id!==g.id||g.activity_type!=="SIMULATION"))throw missing();
  if(draft?.timeline&&(draft.timeline.id!==g.id||g.activity_type!=="TIMELINE"))throw missing();
  return {generation:g,document,prepared,quiz:draft?.quiz??null,activity:draft?.activity??null,timeline:draft?.timeline??null,simulation:draft?.simulation??null,origin:r?.origin??"ai",package:current};
 }
 async recent(){
  const rows=z.array(generationRowSchema).parse(await this.port.read("generations",{user_id:this.owner},8));
  return rows.map(g=>({id:g.id,title:g.title,status:g.status,questions:g.question_count,updatedAt:g.updated_at,deleting:!!g.deleting_at}));
 }
 async pendingDocuments(){
  const docs=z.array(documentRowSchema).parse(await this.port.read("documents",{user_id:this.owner},8));const result=[];
  for(const d of docs){if(!(await this.port.read("generations",{document_id:d.id,user_id:this.owner})).length)result.push({id:d.id,name:d.filename,status:d.status,deleting:!!d.deleting_at});}
  return result;
 }
 async resumeDocument(documentId:string,generationId:string){
  const d=await this.document(documentId);workspaceId.parse(generationId);
  if(d.status==="PREPARED"){const prepared=openPrepared(this.owner,d.id,d.file_sha256,d.prepared_json);await this.port.rpc("workspace_create_generation",{p_id:generationId,p_document:documentId,p_title:prepared.analysis.title.slice(0,100)});return this.snapshot(generationId);}
  let bytes;try{bytes=await this.port.download("scorm-pdfs",d.storage_path);}catch{throw new WorkspaceError(409,"upload_incomplete","La subida no terminó. Selecciona de nuevo el PDF o elimina esta subida pendiente.");}
  if(sha256(bytes)!==d.file_sha256)throw new WorkspaceError(422,"pdf_changed","El archivo almacenado no coincide con el original.");
  return (await this.prepare(new File([new Uint8Array(bytes)],d.filename,{type:"application/pdf"}),d.id,generationId)).snapshot;
 }
 async prepare(file:File,documentId:string,generationId:string){
  workspaceId.parse(documentId);workspaceId.parse(generationId);
  if(!file.size||file.size>20*1024*1024)throw new WorkspaceError(413,"pdf_limit","El PDF supera el límite de 20 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer()),hash=sha256(bytes);
  const existing=(await this.port.read("documents",{id:documentId,user_id:this.owner}))[0];
  if(existing){const d=documentRowSchema.parse(existing);if(d.deleting_at||d.file_sha256!==hash)throw new WorkspaceError(409,"document_conflict","Esta subida corresponde a otro archivo.");
   if(d.status==="PREPARED"){const prepared=openPrepared(this.owner,d.id,d.file_sha256,d.prepared_json);await this.port.rpc("workspace_create_generation",{p_id:generationId,p_document:documentId,p_title:prepared.analysis.title.slice(0,100)});return {snapshot:await this.snapshot(generationId),extracted:null};}
  }
  // Validate real bytes and deterministic content before declaring an uploaded PDF usable.
  let extracted;try{extracted=await extractPDF(file);}catch(error){throw new WorkspaceError(422,"invalid_pdf",error instanceof Error?error.message:"No se pudo leer el PDF.");}
  let prepared;try{prepared=prepareDocumentForActivities(extracted);}catch(error){if(error instanceof InsufficientAcademicContentError)throw new WorkspaceError(422,"insufficient_document_content",error.message);throw error;}
  const sealed=sealPrepared(this.owner,documentId,hash,prepared);
  const d=documentRowSchema.parse(await this.port.rpc("workspace_create_document",{p_id:documentId,p_filename:file.name.slice(0,255),p_size:bytes.length,p_sha:hash}));
  await this.port.upload("scorm-pdfs",d.storage_path,bytes,"application/pdf");
  // Intent row + immutable path survive an interrupted finalization for explicit retry/cleanup.
  await this.port.rpc("workspace_prepare_document",{p_id:documentId,p_pages:extracted.pages,p_prepared:sealed});
  await this.port.rpc("workspace_create_generation",{p_id:generationId,p_document:documentId,p_title:prepared.analysis.title.slice(0,100)});
  return {snapshot:await this.snapshot(generationId),extracted};
 }
 async save(id:string,expected:number,input:unknown,origin:"ai"|"manual",operationId?:string){
  const g=await this.generation(id),{prepared}=await this.preparation(g),quiz=this.canonicalQuiz(input,prepared),q=this.summary(quiz);
  if(g.activity_type!=="QUIZ")throw new WorkspaceError(409,"activity_type","Abre el editor de ruleta para guardar esta actividad.");
  const args={p_id:id,p_draft:{...dehydrateQuiz(quiz),validation:q.validation},p_quality:q.summary,p_ready:q.ready,p_origin:origin};
  const result=await this.port.rpc(operationId?"workspace_finish_generation":"workspace_save_draft",operationId?{...args,p_operation:workspaceId.parse(operationId)}:{...args,p_expected:expected});
  return z.object({revision:z.number().int()}).parse(result);
 }
 async createRoulette(sourceId:string,targetId:string,expected:number){
  workspaceId.parse(targetId);if(sourceId===targetId)throw new WorkspaceError(422,"activity_type","La ruleta debe tener su propia identidad.");
  const source=await this.snapshot(sourceId);if(!source.quiz||source.generation.current_revision!==expected)throw new WorkspaceError(409,"revision_conflict","El cuestionario cambió. Recupera su revisión antes de crear la ruleta.");
  if(!validateQuiz(source.quiz).valid)throw new WorkspaceError(422,"quiz_blocked","Resuelve los bloqueos del cuestionario antes de reutilizarlo.");
  const g=generationRowSchema.parse(await this.port.rpc("workspace_create_generation",{p_id:targetId,p_document:source.document.id,p_title:source.quiz.title}));
  if(g.current_revision){const saved=await this.snapshot(targetId);if(saved.activity?.sourceGenerationId!==sourceId||saved.activity.sourceRevision!==expected)throw new WorkspaceError(409,"revision_conflict","Esta identidad ya pertenece a otra actividad.");return saved;}
  await this.saveRoulette(targetId,0,dehydrateQuiz(source.quiz).quiz,rouletteFromQuiz(source.quiz,targetId,sourceId,expected));
  return this.snapshot(targetId);
 }
 async saveRoulette(id:string,expected:number,input:unknown,specInput:unknown){
  const g=await this.generation(id),{prepared}=await this.preparation(g),quiz=this.canonicalQuiz(input,prepared),spec=rouletteSpecSchema.parse(specInput);
  if(spec.id!==id||(g.current_revision>0&&g.activity_type!=="ROULETTE"))throw missing();
  if(g.current_revision){const previous=await this.revision(g),old=previous?readActivityDraft(previous.draft_json,prepared).activity:null;if(!old||old.sourceGenerationId!==spec.sourceGenerationId||old.sourceRevision!==spec.sourceRevision)throw new WorkspaceError(422,"activity_source","La procedencia de la actividad no puede modificarse.");}
  else{const source=await this.generation(spec.sourceGenerationId);if(source.document_id!==g.document_id||!await this.revision(source,spec.sourceRevision))throw missing();}
  const quality=validateActivity(quiz,spec),draft=persistedRouletteDraftSchema.parse({...dehydrateQuiz(quiz),version:2,activity:spec});
  return z.object({revision:z.number().int()}).parse(await this.port.rpc("workspace_save_draft",{p_id:id,p_expected:expected,p_draft:draft,p_quality:{valid:quality.valid,blocking:quality.issues.filter(i=>i.severity==="BLOCKING").length,warnings:quality.issues.filter(i=>i.severity==="WARNING").length},p_ready:quality.valid,p_origin:"manual"}));
 }
 private async claim(g:WorkspaceGeneration,operationId:string,kind:"GENERATE"|"REGENERATE"|"PACKAGE",expected:number,fingerprint:unknown){
  const event=operationSchema.parse(await this.port.rpc("workspace_claim_operation",{p_id:g.id,p_operation:workspaceId.parse(operationId),p_kind:kind,p_hash:sha256(JSON.stringify(fingerprint)),p_expected:expected}));
  if(!event.claimed&&event.status!=="COMPLETED")throw new WorkspaceError(409,event.status==="RUNNING"?"operation_busy":"operation_failed",event.status==="RUNNING"?"La operación ya está en curso. No se ha iniciado otra inferencia.":"La operación anterior falló. Puedes solicitar un reintento explícito.");
  return event;
 }
 async createSimulation(sourceId:string,targetId:string,expected:number,manual=false){
  workspaceId.parse(targetId);const source=await this.snapshot(sourceId);
  if(source.generation.current_revision!==expected)throw new WorkspaceError(409,"revision_conflict","El documento cambió. Recupera la revisión actual.");
  if(targetId===sourceId&&expected>0)throw new WorkspaceError(422,"activity_type","Conserva la actividad anterior y crea una identidad nueva.");
  let spec;try{if(!manual)spec=prepareSimulation(source.prepared.document.fragments,source.prepared.document.documentId,targetId,source.generation.title);}catch(error){throw new WorkspaceError(422,"insufficient_simulation_content",error instanceof Error?error.message:"No hay decisiones fundamentadas suficientes.");}
  spec??={id:targetId,type:"SIMULATION" as const,schemaVersion:1 as const,documentId:source.prepared.document.documentId,title:source.generation.title,description:"",instructions:"Lee cada situación, decide y contrasta las consecuencias con el material.",startSceneId:"",scenes:[],configuration:{scored:false,passingScore:70,maxSteps:40,allowRetry:true,maxAttempts:2}};
  const g=generationRowSchema.parse(await this.port.rpc("workspace_create_generation",{p_id:targetId,p_document:source.document.id,p_title:spec.title}));if(g.document_id!==source.document.id)throw missing();
  if(g.current_revision){const saved=await this.snapshot(targetId);if(!saved.simulation)throw missing();return saved;}
  if(!manual&&spec.preparation?.level==="partial"&&detectSimulationCases(source.prepared.document.fragments).length){
   try{spec=await writeSimulationCase(source.prepared.document.fragments,source.prepared.document.documentId,targetId,source.generation.title,this.provider());}
   catch(error){throw new WorkspaceError(422,"simulation_case_generation",error instanceof Error?error.message:"No se pudo redactar el caso. El PDF y el plan siguen disponibles.");}
  }
  await this.saveSimulation(targetId,0,spec);return this.snapshot(targetId);
 }
 async saveSimulation(id:string,expected:number,input:unknown){
  const g=await this.generation(id),{prepared}=await this.preparation(g),spec=editableSimulationSchema.parse(input);
  if(spec.id!==id||spec.documentId!==prepared.document.documentId||g.current_revision>0&&g.activity_type!=="SIMULATION")throw missing();
  if(spec.scenes.some(s=>s.sourceFragmentIds.some(id=>!prepared.document.fragments.some(f=>f.id===id&&f.documentId===spec.documentId&&f.contentType==="academic"))))throw new WorkspaceError(422,"invalid_source","Usa únicamente fuentes académicas de este PDF.");
  const q=validateSimulation(spec,prepared.document.fragments,prepared.document.documentId);
  try{return z.object({revision:z.number().int()}).parse(await this.port.rpc("workspace_save_draft",{p_id:id,p_expected:expected,p_draft:persistedSimulationDraftSchema.parse({version:4,activity:spec}),p_quality:{valid:q.valid,blocking:q.issues.filter(i=>i.severity==="BLOCKING").length,warnings:q.issues.filter(i=>i.severity==="WARNING").length},p_ready:q.valid,p_origin:"manual"}));}
  catch(e){if(e instanceof WorkspaceError&&e.databaseCode==="22023"&&g.current_revision===0)throw new WorkspaceError(503,"simulation_not_activated","La simulación está pendiente de activación del servidor. Tu PDF sigue preparado y guardado.");throw e;}
 }
 async createTimeline(sourceId:string,targetId:string,expected:number,modeInput:unknown,count:number,manual=false){
  workspaceId.parse(targetId);const source=await this.snapshot(sourceId);
  if(source.generation.current_revision!==expected)throw new WorkspaceError(409,"revision_conflict","El documento cambió. Recupera la revisión antes de preparar la línea de tiempo.");
  if(targetId===sourceId&&expected>0)throw new WorkspaceError(422,"activity_type","Conserva la actividad anterior y crea una identidad nueva.");
  const mode=timelineModeSchema.parse(modeInput);z.number().int().min(2).max(20).parse(count);
  let spec;try{if(!manual)spec=prepareTimeline(source.prepared.document.fragments,source.prepared.document.documentId,targetId,source.generation.title,mode,count);}catch(e){if(!manual)throw new WorkspaceError(422,"insufficient_timeline_content",e instanceof Error?e.message:"No hay una secuencia verificable.");}
  if(!spec)spec={id:targetId,type:"TIMELINE" as const,schemaVersion:1 as const,documentId:source.prepared.document.documentId,title:source.generation.title,description:"",instructions:"Explora los hitos y completa el recorrido de aprendizaje.",mode,events:[],configuration:{presentation:"auto" as const,showEventDetails:true,allowBackNavigation:true,requireAllEventsVisited:true,enableFeedback:true,allowRetry:true,maxAttempts:2},assessment:{mode:"EXPLORATORY" as const,passingScore:70,orderBasis:"none" as const,teacherOrderConfirmed:false}};
  const g=generationRowSchema.parse(await this.port.rpc("workspace_create_generation",{p_id:targetId,p_document:source.document.id,p_title:spec.title}));
  if(g.document_id!==source.document.id)throw missing();
  if(g.current_revision){const saved=await this.snapshot(targetId);if(!saved.timeline)throw missing();return saved;}
  await this.saveTimeline(targetId,0,spec);return this.snapshot(targetId);
 }
 async saveTimeline(id:string,expected:number,input:unknown,operationId?:string){
  const g=await this.generation(id),{prepared}=await this.preparation(g),spec=editableTimelineSchema.parse(input);
  if(spec.id!==id||spec.documentId!==prepared.document.documentId||(g.current_revision>0&&g.activity_type!=="TIMELINE"))throw missing();
  // Unknown/foreign/administrative references are never persisted, even as an editable draft.
  if(spec.events.some(e=>e.sourceFragmentIds.some(id=>!prepared.document.fragments.some(f=>f.id===id&&f.contentType==="academic"&&f.documentId===spec.documentId))))throw new WorkspaceError(422,"invalid_source","Selecciona únicamente fuentes académicas de este PDF.");
  const quality=validateTimeline(spec,prepared.document.fragments,prepared.document.documentId),draft=persistedTimelineDraftSchema.parse({version:3,activity:spec});
  const args={p_id:id,p_draft:draft,p_quality:{valid:quality.valid,blocking:quality.issues.filter(i=>i.severity==="BLOCKING").length,warnings:quality.issues.filter(i=>i.severity==="WARNING").length},p_ready:quality.valid,p_origin:operationId?"ai":"manual"};
  try{return z.object({revision:z.number().int()}).parse(await this.port.rpc(operationId?"workspace_finish_generation":"workspace_save_draft",operationId?{...args,p_operation:workspaceId.parse(operationId)}:{...args,p_expected:expected}));}
  catch(error){if(error instanceof WorkspaceError&&error.databaseCode==="22023"&&g.current_revision===0)throw new WorkspaceError(503,"timeline_not_activated","La línea de tiempo está pendiente de activación en el servidor. Tu PDF sigue guardado; no necesitas volver a analizarlo.");throw error;}
 }
 async rewriteTimeline(id:string,operationId:string,expected:number,eventId:string){
  const snapshot=await this.snapshot(id),spec=snapshot.timeline,event=spec?.events.find(e=>e.id===eventId);if(!spec||!event)throw missing();
  const sources=snapshot.prepared.document.fragments.filter(f=>event.sourceFragmentIds.includes(f.id)&&f.contentType==="academic");if(!sources.length)throw new WorkspaceError(422,"missing_source","Selecciona una fuente del PDF antes de pedir redacción asistida.");
  if(event.date&&!sources.some(f=>datesIn(f.text).some(d=>d.start===event.date!.start&&d.end===event.date!.end)))throw new WorkspaceError(422,"unsupported_date","La fecha docente no consta en estas fuentes. Puedes editarla manualmente; no se enviará a la IA como si procediera del PDF.");
  const claim=await this.claim(snapshot.generation,operationId,"REGENERATE",expected,{timelineEvent:eventId});if(!claim.claimed)return this.snapshot(id);
  try{const provider=this.provider();if(!provider.rewriteTimelineEvent)throw new WorkspaceError(503,"wording_unavailable","La redacción asistida no está disponible con este proveedor. Puedes seguir editando manualmente.");
   const result=timelineWordingSchema.parse(await provider.rewriteTimelineEvent({eventId,title:event.title,description:event.description,sources}));
   if(result.eventId!==eventId||datesIn(result.title+" "+result.description).some(d=>!sources.some(f=>datesIn(f.text).some(s=>s.start===d.start&&s.end===d.end))))throw new WorkspaceError(422,"unsupported_wording","La redacción añadió una fecha o identidad no permitida. Se conserva el borrador anterior.");
   await this.saveTimeline(id,expected,{...spec,events:spec.events.map(e=>e.id===eventId?{...e,title:result.title,description:result.description,provenance:"assisted"}:e)},operationId);return this.snapshot(id);
  }catch(error){try{await this.port.rpc("workspace_fail_operation",{p_id:id,p_operation:operationId});}catch{}throw error;}
 }
 async generate(id:string,operationId:string,expected:number,configInput:unknown,force=false){
  const g=await this.generation(id),{prepared}=await this.preparation(g),config=quizConfigSchema.parse(configInput);
  if(g.activity_type!=="QUIZ")throw new WorkspaceError(422,"activity_type","La ruleta reutiliza sus retos; no inicia generación automática.");
  if(!force&&g.current_revision)return this.snapshot(id);
  // Reject infeasible requests before creating an operation or constructing a provider.
  buildHybridPlan(prepared,config.count,config.coverageMode);
  const event=await this.claim(g,operationId,"GENERATE",expected,config);if(!event.claimed)return this.snapshot(id);
  let quiz:StudioQuiz;
  try{quiz=await generateHybridQuiz(prepared,config,this.provider());}
  catch(error){try{await this.port.rpc("workspace_fail_operation",{p_id:id,p_operation:operationId});}catch{/* The durable RUNNING intent remains visible for recovery. */}throw error;}
  try{await this.save(id,expected,quiz,"ai",operationId);}
  catch{throw new PendingDraftError({quiz,operationId,generationId:id});}
  return this.snapshot(id);
 }
 async regenerate(id:string,operationId:string,expected:number,questionId:string){
  const snapshot=await this.snapshot(id),quiz=snapshot.quiz;if(!quiz||snapshot.activity)throw missing();
  const slot=quiz.blueprint.slots.find(s=>s.questionId===questionId);if(!slot)throw missing();
  const event=await this.claim(snapshot.generation,operationId,"REGENERATE",expected,{questionId,slot});if(!event.claimed)return this.snapshot(id);
  let next:StudioQuiz;
  try{
   const others=quiz.questions.filter(q=>q.id!==questionId).map(q=>({id:q.id,concept:q.concept,conceptLabel:quiz.analysis.keyConcepts.find(c=>c.id===q.concept)?.text??q.concept,stem:q.stem.slice(0,500),cognitiveLevel:q.cognitiveLevel,sourceFragmentIds:q.sourceFragmentIds}));
   const result=await regenerateHybridQuestion(snapshot.prepared,slot,others,this.provider());
   next=compilePedagogicalQuiz(syncBlueprint({...quiz,questions:quiz.questions.map(q=>q.id===questionId?result.question:q)})).quiz;
  }catch(error){try{await this.port.rpc("workspace_fail_operation",{p_id:id,p_operation:operationId});}catch{}throw error;}
  try{await this.save(id,expected,next,snapshot.origin,operationId);}catch{throw new PendingDraftError({quiz:next,operationId,generationId:id});}
  return this.snapshot(id);
 }
 async buildPackage(id:string,operationId:string,expected:number){
  const snapshot=await this.snapshot(id),quiz=snapshot.quiz,spec=snapshot.simulation??snapshot.timeline??snapshot.activity,sources=snapshot.prepared.document.fragments;
  if((!quiz&&!snapshot.timeline&&!snapshot.simulation)||!validateActivity(quiz,spec,sources).valid)throw new WorkspaceError(422,"quiz_blocked","Corrige los problemas que bloquean la actividad antes de generar SCORM.");
  const event=await this.claim(snapshot.generation,operationId,"PACKAGE",expected,{revision:expected});
  if(!event.claimed){if(!snapshot.package)throw new WorkspaceError(409,"package_obsolete","El paquete anterior ya no corresponde al borrador actual.");return snapshot.package;}
  let reserved:WorkspacePackage|null=null;
  try{
   const bytes=packageActivity(quiz,spec,sources);validateActivityArtifact(bytes,quiz,spec,sources);
   reserved=packageRowSchema.parse(await this.port.rpc("workspace_reserve_package",{p_id:id,p_operation:operationId,p_package:randomUUID()}));
   await this.port.upload("scorm-packages",reserved.storage_path,bytes,"application/zip");
   return packageRowSchema.parse(await this.port.rpc("workspace_finish_package",{p_id:id,p_operation:operationId,p_package:reserved.id,p_size:bytes.length,p_sha:sha256(bytes)}));
  }catch(error){
   try{await this.port.rpc("workspace_fail_operation",{p_id:id,p_operation:operationId});if(reserved)await this.port.remove("scorm-packages",[reserved.storage_path]);}catch{/* Failed upload is still tracked by its package row; delete/retry can clean it. */}
   throw error;
  }
 }
 async downloadPackage(id:string){
  const before=await this.snapshot(id),p=before.package,spec=before.simulation??before.timeline??before.activity,sources=before.prepared.document.fragments;if(!p||(!before.quiz&&!before.timeline&&!before.simulation)||!validateActivity(before.quiz,spec,sources).valid)throw new WorkspaceError(409,"package_obsolete","Genera el SCORM de la revisión actual antes de descargarlo.");
  const expectedPath=`${this.owner}/${id}/r${p.revision}/${p.id}/package.zip`;if(p.storage_path!==expectedPath)throw missing();
  const bytes=await this.port.download("scorm-packages",p.storage_path);
  if(sha256(bytes)!==p.file_sha256)throw new WorkspaceError(422,"package_invalid","El paquete almacenado no pudo validarse. Genera uno nuevo.");
  validateActivityArtifact(bytes,before.quiz,spec,sources);
  const after=await this.generation(id);if(after.current_revision!==p.revision||after.current_package_id!==p.id)throw new WorkspaceError(409,"package_obsolete","El borrador cambió durante la descarga. Genera su versión actual.");
  return {bytes,quiz:before.quiz,preview:validateActivityArtifact(bytes,before.quiz,spec,sources).html};
 }
 async downloadPDF(id:string){const d=await this.document(id),bytes=await this.port.download("scorm-pdfs",d.storage_path);if(sha256(bytes)!==d.file_sha256)throw new WorkspaceError(422,"pdf_changed","El archivo almacenado no coincide con el original.");return {bytes,name:d.filename};}
 async remove(id:string,isDocument=false){
  const plan=z.object({packages:z.array(z.string()),pdf:z.string().optional(),documentId:workspaceId.optional()}).parse(await this.port.rpc("workspace_begin_delete",{p_id:workspaceId.parse(id),p_document:isDocument}));
  await this.port.remove("scorm-packages",plan.packages);if(plan.pdf)await this.port.remove("scorm-pdfs",[plan.pdf]);
  await this.port.rpc("workspace_finish_delete",{p_id:id,p_document:isDocument});
  // A shared PDF is retained while another activity references it.
  if(plan.documentId){const others=await this.port.read("generations",{document_id:plan.documentId,user_id:this.owner});if(!others.length)await this.remove(plan.documentId,true);}
 }
 async release(id:string,operationId:string){await this.port.rpc("workspace_release_operation",{p_id:workspaceId.parse(id),p_operation:workspaceId.parse(operationId)});}
}
