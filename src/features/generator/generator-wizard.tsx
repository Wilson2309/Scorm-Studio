"use client";
import {SimulationPreparation} from "@/features/simulation/simulation-preparation";
import {TimelinePreparation} from "@/features/timeline/timeline-preparation";
import {PipelineProgress,type ProgressStatus} from "@/components/ui/pipeline-progress";
import {ActivityTypeCards,type ActivityChoice} from "./activity-type-cards";
import {AssessmentPreparation} from "./assessment-preparation";
import {AssessmentCapacityError} from "@/lib/content/hybrid-plan";
import {CreateRoulette} from "@/features/roulette/create-roulette";
import { useEffect, useRef, useState } from "react";
import {useSearchParams,useRouter} from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, FileText, Sparkles, LockKeyhole, Package, Download, Eye } from "lucide-react";
import { z } from "zod";
import {validateSCORMArtifact} from "@/lib/content/scorm-artifact";
import {ReviewRevision} from "@/lib/content/review-state";
import { Badge, Button, ButtonLink, PageHeader } from "@/components/ui/primitives";
import { PDFDropzone } from "@/components/generator/pdf-dropzone";
import { useDocumentSelection } from "@/components/generator/document-context";
import { ActivityMotif } from "@/components/generator/activity-motif";
import { cn } from "@/lib/utils";
import { extractedDocumentSchema, quizConfigSchema, type ExtractedDocument } from "@/lib/quiz/schema";
import { studioQuizSchema, type DocumentAnalysis, type NormalizedDocument, type StudioQuiz } from "@/lib/content/schema";
import { generationState } from "@/lib/content/quality";
import { renderQuiz } from "@/lib/scorm/template";
import { DocumentUnderstanding } from "./document-understanding";
import { QuizStudio } from "./quiz-studio";
import { OperationGate } from "@/lib/content/document-session";
import {createManualQuiz,buildHybridPlan} from "@/lib/content/hybrid-plan";
import {WorkspaceRecovery,WorkspaceSaveStatus} from "./workspace-controls";
import {parseWorkspaceSnapshot,packageRowSchema,hydrateQuiz,persistedDraftSchema} from "@/lib/workspace/contracts";
import {workspaceRequest,workspaceCommand,WorkspaceClientError} from "@/lib/workspace/client";

const steps=["Documento","Comprender","Diseñar","Configurar","Quiz Studio"];
const headings=["Todo empieza con tu contenido.","Comprender antes de preguntar.","Del concepto al aprendizaje.","Preparamos tu evaluación.","Afina cada idea, pregunta a pregunta."];
const descriptions=["Selecciona un PDF con texto para construir una experiencia de aprendizaje.","Separamos el contenido académico y analizamos sus ideas con referencias al PDF.","Selecciona una actividad para trabajar el contenido fundamentado de tu material.","El plan de evaluación se prepara antes de generar las preguntas.","Edita, contrasta las fuentes y construye una actividad válida para el aula."];
const packageStages=["Revisar configuración","Crear paquete SCORM","Recuperar archivo","Comprobar ZIP"];
export function Stepper({step}:{step:number}){
  return <nav aria-label="Progreso de creación" className="studio-stepper"><ol>{steps.map((name,i)=><li key={name} className={cn(i===step&&"current",i<step&&"complete")} aria-current={i===step?"step":undefined}><span>{i<step?<Check size={15}/>:i+1}</span><span>{name}</span></li>)}</ol><p>Paso {step+1} de 5 · {steps[step]}</p></nav>;
}
export function GeneratorWizard(){
  const {session,workspace,openWorkspace}=useDocumentSelection(),params=useSearchParams(),id=params.get("generation"),routeRouter=useRouter();
  const [loadError,setLoadError]=useState("");
  useEffect(()=>{if(workspace&&(!id||workspace.generationId===id)&&["ROULETTE","TIMELINE","SIMULATION"].includes(workspace.activityType??""))routeRouter.replace(`${workspace.activityType==="SIMULATION"?"/simulacion":workspace.activityType==="TIMELINE"?"/linea-de-tiempo":"/ruleta"}?generation=${workspace.generationId}`);},[id,workspace,routeRouter]);
  useEffect(()=>{if(!id||workspace?.generationId===id)return;let active=true;void openWorkspace(id).catch(e=>{if(active)setLoadError(e instanceof Error?e.message:"No se pudo recuperar.");});return()=>{active=false;};},[id,workspace?.generationId,openWorkspace]);
  if(id&&workspace?.generationId!==id)return <section className="creative-workspace"><p role={loadError?"alert":"status"}>{loadError||"Recuperando actividad guardada…"}</p><ButtonLink href="/crear" variant="secondary">Volver a crear</ButtonLink></section>;
  if(workspace?.activityType==="SIMULATION")return <p role="status">Abriendo tu simulación...</p>;
  if(workspace?.activityType==="TIMELINE"){return <p role="status">Abriendo tu línea de tiempo...</p>;}
  if(workspace?.activityType==="ROULETTE")return <p role="status">Abriendo tu ruleta...</p>;
  return <><WorkspaceRecovery/><WizardSession key={session.id}/></>;
}
function WizardSession(){
  const {document:selection,setDocument,session,workspace,getWorkspace,acceptWorkspace,queueSave,flushSaves,uploadIntent,rememberPackage}=useDocumentSelection(),router=useRouter();
  const [step,setStep]=useState(session.quiz?4:session.understanding?3:0),[extracted,setExtracted]=useState<ExtractedDocument|null>(session.extracted);
  const [analysis,setAnalysis]=useState<DocumentAnalysis|null>(session.understanding?.analysis??null),[normalized,setNormalized]=useState<NormalizedDocument|null>(session.understanding?.document??null);
  const [title,setTitle]=useState(session.quiz?.title??session.understanding?.analysis.title.slice(0,100)??""),[countInput,setCountInput]=useState(String(session.quiz?.questions.length??5)),[scored,setScored]=useState(session.quiz?.scored??true);
  const [quiz,setQuiz]=useState<StudioQuiz|null>(session.quiz),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false);
  const [generationFailed,setGenerationFailed]=useState(false),[contentStage,setContentStage]=useState<"idle"|"preparing"|"writing"|"validating"|"ready">(session.quiz?"ready":"idle");
  const activityParam=useSearchParams().get("activity");
  const [activity,setActivity]=useState<ActivityChoice>(activityParam==="simulation"?"SIMULATION":activityParam==="timeline"?"TIMELINE":activityParam==="roulette"?"ROULETTE":session.activityChoice);
  const [quantityTouched,setQuantityTouched]=useState(false);
  const [progressFailure,setProgressFailure]=useState<{id:string;detail:string}|null>(null);
  const prepared=session.understanding?.prepared;
  const count=/^\d+$/.test(countInput)?Number(countInput):Number.NaN;
  let plan:ReturnType<typeof session.getPlan>|null=null,planError="",availableCount:number|null=null;
  if(prepared&&activity!=="TIMELINE"&&activity!=="SIMULATION"){if(!Number.isInteger(count)||count<3||count>20)planError="Escribe una cantidad entre 3 y 20 preguntas.";else try{plan=session.getPlan(count,quiz?.blueprint.coverageMode??"breadth");}catch(e){if(e instanceof AssessmentCapacityError){planError=e.message;availableCount=e.available;}else planError="No se pudo preparar la evaluación. Vuelve a abrir el documento; si persiste, comunica este error.";}}
  const [message,setMessage]=useState(""),[error,setError]=useState(""),[preview,setPreview]=useState(false);
  const [stage,setStage]=useState(-1),[artifact,setArtifact]=useState<{url:string;size:number;html:string}|null>(null);
  const heading=useRef<HTMLHeadingElement>(null),errorSummary=useRef<HTMLParagraphElement>(null),controller=useRef<AbortController|null>(null);
  const gate=useRef(new OperationGate());
  const revision=useRef(new ReviewRevision());
  const reduced=useReducedMotion(),state=generationState(quiz,busy||editing);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>()=>{if(artifact)URL.revokeObjectURL(artifact.url);},[artifact]);
  useEffect(()=>{if(error)errorSummary.current?.focus();},[error]);
  function go(next:number){setError("");setStep(next);requestAnimationFrame(()=>heading.current?.focus());}
  function invalidate(){setArtifact(null);setPreview(false);setStage(-1);}
  function changeQuiz(next:StudioQuiz){session.cacheQuiz(next);queueSave(next);revision.current.invalidate();setQuiz(next);invalidate();}
  function receiveSnapshot(value:unknown){if(controller.current?.signal.aborted)throw new DOMException("Solicitud cancelada","AbortError");const next=parseWorkspaceSnapshot(value);if(getWorkspace()?.generationId!==next.generation.id)throw new DOMException("Actividad cambiada","AbortError");acceptWorkspace(next);setNormalized(next.prepared.document);setAnalysis(next.prepared.analysis);setQuiz(next.quiz);revision.current.invalidate();invalidate();return next;}
  function begin(){if(!gate.current.enter())return null;const next=new AbortController();controller.current=next;setBusy(true);setError("");setProgressFailure(null);return next.signal;}
  function end(){gate.current.leave();setBusy(false);}
  function fail(e:unknown,progressId?:string){
    if(progressId&&!(e instanceof DOMException&&e.name==="AbortError"))setProgressFailure({id:progressId,detail:e instanceof Error?e.message:"No se pudo completar la operación."});
    if(e instanceof WorkspaceClientError&&e.recovery&&prepared&&e.recovery.generationId===getWorkspace()?.generationId&&!controller.current?.signal.aborted){const next=hydrateQuiz(persistedDraftSchema.parse({version:1,quiz:e.recovery.quiz,sourceIds:prepared.document.fragments.map(f=>f.id)}),prepared);session.setOrigin("ai");session.cacheQuiz(next);queueSave(next,e.recovery.operationId,true);setQuiz(next);setStep(4);setContentStage("ready");}
    if(e instanceof DOMException&&e.name==="AbortError")setMessage("Solicitud cancelada. Puedes volver a intentar.");else setError(e instanceof Error?e.message:"No se pudo conectar. Intenta de nuevo.");
  }
  async function understand(){
    if(!selection?.file)return;const signal=begin();if(!signal)return;
    try{setContentStage("preparing");
      const result=await session.understand(async sessionSignal=>{
        setMessage("Subiendo el PDF privado, extrayendo contenido y preparando la evaluación sin IA…");
        const ids=uploadIntent(),form=new FormData();form.set("file",selection.file!);form.set("documentId",ids.documentId);form.set("generationId",ids.generationId);
        const result=z.object({snapshot:z.unknown(),extracted:extractedDocumentSchema.nullable()}).parse(await workspaceRequest("/api/workspace/documents",{method:"POST",body:form,signal:sessionSignal}));
        if(sessionSignal.aborted)throw new DOMException("Solicitud cancelada","AbortError");
        const snapshot=parseWorkspaceSnapshot(result.snapshot);acceptWorkspace(snapshot,result.extracted);router.replace(`/crear?generation=${snapshot.generation.id}`,{scroll:false});
        return {document:snapshot.prepared.document,analysis:snapshot.prepared.analysis,prepared:snapshot.prepared};
      });
      setContentStage("idle");setExtracted(session.extracted);
      setNormalized(result.document);setAnalysis(result.analysis);setTitle(result.analysis.title.slice(0,100));setMessage("Contenido preparado mediante reglas locales. Todavía no se ha llamado a la IA.");
    }catch(e){fail(e,"document");}finally{end();}
  }
  async function generate(force=false){
    if(!force&&session.quiz){setQuiz(session.quiz);go(4);return;}
    const config=quizConfigSchema.safeParse({title,count,scored,coverageMode:quiz?.blueprint.coverageMode??"breadth"});if(!config.success){setError(config.error.issues[0].message);return;}
    if(!analysis||!normalized||!prepared){setError("Prepara primero el documento.");return;}
    if(!plan){setError(planError);return;}
    const configKey=JSON.stringify(config.data);
    if(!force&&session.quiz&&session.quizConfigKey===configKey){setQuiz(session.quiz);go(4);return;}
    const signal=begin();if(!signal)return;setGenerationFailed(false);
    try{
      setContentStage("writing");setMessage("Redactando los enunciados y las explicaciones con IA… Las respuestas y alternativas ya están preparadas.");
      await flushSaves();const current=getWorkspace();if(!current)throw new Error("Guarda primero el documento en tu cuenta.");
      const response=z.object({snapshot:z.unknown()}).parse(await workspaceCommand(current.generationId,{action:"generate",operationId:crypto.randomUUID(),expectedRevision:current.revision,config:config.data,force},signal));setContentStage("validating");
      receiveSnapshot(response.snapshot);session.rememberGenerated(configKey);setContentStage("ready");setMessage("Borrador guardado y validado mediante reglas. Requiere revisión docente.");go(4);
    }catch(e){setGenerationFailed(true);setContentStage("idle");fail(e,"writing");}finally{end();}
  }
  function manual(){if(!prepared)return;try{const manualPlan=buildHybridPlan(prepared,count,quiz?.blueprint.coverageMode??"breadth","manual");session.setOrigin("manual");changeQuiz(createManualQuiz(prepared,manualPlan,title.slice(0,100),scored));setGenerationFailed(false);go(4);}catch(e){fail(e);}}
  async function regenerate(id:string){
    if(!quiz||!normalized||!analysis)return;const question=quiz.questions.find(q=>q.id===id),slot=quiz.blueprint.slots.find(s=>s.questionId===id);if(!question||!slot)return;const signal=begin();if(!signal)return;
    try{setContentStage("writing");
      setMessage("Regenerando una pregunta con sus conceptos y fuentes…");
      await flushSaves();const current=getWorkspace();if(!current)throw new Error("Guarda primero la actividad.");
      const result=z.object({snapshot:z.unknown()}).parse(await workspaceCommand(current.generationId,{action:"regenerate",operationId:crypto.randomUUID(),expectedRevision:current.revision,questionId:id},signal));
      receiveSnapshot(result.snapshot);setContentStage("ready");setMessage("Pregunta regenerada y guardada. Revisa la explicación y su evidencia.");
    }catch(e){setContentStage("idle");fail(e,"writing");}finally{end();}
  }
  async function buildPackage(){
    if(!quiz||!state.enabled)return;const signal=begin();if(!signal)return;
    const expectedRevision=revision.current.capture();setArtifact(null);let packagePhase=0;
    try{
      setMessage("Construyendo y verificando el paquete SCORM…");setStage(0);const validated=studioQuizSchema.parse(quiz);if(!generationState(validated).enabled)throw new Error(state.reason);
      await flushSaves();const current=getWorkspace();if(!current)throw new Error("Guarda primero la actividad.");packagePhase=1;setStage(1);
      if(!current.package){const result=z.object({package:packageRowSchema}).parse(await workspaceCommand(current.generationId,{action:"package",operationId:crypto.randomUUID(),expectedRevision:current.revision},signal));rememberPackage(result.package);}
      packagePhase=2;setStage(2);const response=await fetch(`/api/workspace/${current.generationId}/download`,{signal,cache:"no-store"});
      if(!response.ok){const result=await response.json();throw new Error(result.error||"No se pudo empaquetar el quiz.");}
      const blob=await response.blob();packagePhase=3;setStage(3);const verified=validateSCORMArtifact(new Uint8Array(await blob.arrayBuffer()),validated);
      if(signal.aborted||!revision.current.isCurrent(expectedRevision))return;
      setArtifact({url:URL.createObjectURL(blob),size:verified.size,html:verified.html});setStage(4);setMessage("Paquete preparado con la revisión actual y estructura ZIP comprobada.");
    }catch(e){setStage(-1);fail(e,`package-${packagePhase}`);}finally{end();}
  }
  async function downloadStored(){
    if(!quiz)return;const signal=begin();if(!signal)return;
    try{await flushSaves();const current=getWorkspace();if(!current?.package)throw new Error("Genera el paquete de la revisión actual antes de descargar.");
      const response=await fetch(`/api/workspace/${current.generationId}/download`,{signal,cache:"no-store"});
      if(!response.ok){const result=await response.json();throw new Error(result.error||"El paquete ya no corresponde a esta revisión.");}
      const blob=await response.blob(),verified=validateSCORMArtifact(new Uint8Array(await blob.arrayBuffer()),quiz),url=URL.createObjectURL(blob);
      setArtifact({url,size:verified.size,html:verified.html});const link=document.createElement("a");link.href=url;link.download="scorm-studio-quiz.zip";link.click();
    }catch(e){fail(e);}finally{end();}
  }
  return <div className="creative-workspace" data-generation-id={workspace?.generationId}><PageHeader eyebrow="Asistente de creación" title="Diseña una forma de aprender." description="Tu contenido es el origen. La experiencia la decides tú." action={<Badge tone="blue">{activity==="SIMULATION"?"Simulación":activity==="TIMELINE"?"Línea de tiempo":activity==="ROULETTE"?"Ruleta":"Quiz"} · SCORM 1.2</Badge>}/><WorkspaceSaveStatus/><Stepper step={step}/>
    <div className={cn("creative-workspace-grid",step===4&&"quiz-studio-workspace")}><section className="creative-canvas" aria-busy={busy}><div className="creative-heading"><h2 ref={heading} tabIndex={-1}>{step===3&&activity==="SIMULATION"?"Preparamos tus escenarios.":step===3&&activity==="TIMELINE"?"Preparamos tu línea de tiempo.":headings[step]}</h2><p>{step===3&&activity==="SIMULATION"?"Situaciones basadas en tu material, con revisión docente.":step===3&&activity==="TIMELINE"?"Un recorrido con fuentes verificables y espacio para tu revisión.":descriptions[step]}</p></div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{opacity:0,y:reduced?0:5}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduced?0:.16}}>
        {step===0&&<><PDFDropzone value={selection} onChange={value=>{setDocument(value);router.replace("/crear",{scroll:false});}} action={<Button onClick={()=>go(1)}>Comprender el contenido<ArrowRight size={17}/></Button>}/><p className="studio-privacy"><LockKeyhole size={15}/>Al preparar el documento se guarda el PDF de forma privada en tu cuenta. Solo las evidencias seleccionadas se envían a la IA para redactar preguntas.</p></>}
        {step===1&&<><div className="document-strip"><FileText size={24}/><div><strong>{selection?.name}</strong><small>{extracted?`Extracción real · ${extracted.pages} páginas · ${extracted.text.length.toLocaleString("es")} caracteres`: "Hasta 20 MB · 100 páginas"}</small></div><Badge>PDF</Badge></div>{!analysis&&<div className="understanding-empty"><h3>Un mapa del contenido antes de evaluar.</h3><p>Identificamos conceptos, objetivos y secciones. Los encabezados, contactos y datos administrativos quedan separados de la evaluación.</p><Button disabled={busy} onClick={understand}><Sparkles size={17}/>{busy?"Preparando documento…":extracted?"Preparar contenido":"Extraer y preparar contenido"}</Button></div>}{analysis&&normalized&&<DocumentUnderstanding analysis={analysis} document={normalized} method={prepared?.method}/>} {extracted&&<details className="understanding-detail"><summary>Información extraída del PDF · Sin interpretación IA</summary>{extracted.warnings.map(w=><p key={w}>{w}</p>)}<div className="extracted-text"><pre>{extracted.text}</pre></div></details>}</>}
        {step===2&&<ActivityTypeCards value={activity} onChange={next=>{setActivity(next);session.setActivityChoice(next);const params=new URLSearchParams(window.location.search);params.set("activity",next==="SIMULATION"?"simulation":next==="TIMELINE"?"timeline":next==="ROULETTE"?"roulette":"quiz");router.replace(`/crear?${params.toString()}`);}}/>}
        {step===3&&activity==="SIMULATION"&&prepared&&<SimulationPreparation prepared={prepared}/>}
        {step===3&&activity==="TIMELINE"&&prepared&&<TimelinePreparation prepared={prepared}/>}
        {step===3&&activity!=="TIMELINE"&&activity!=="SIMULATION"&&<div className="studio-config"><div className="field title-field"><label htmlFor="activity-title">Nombre de la experiencia</label><input id="activity-title" value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></div><div className="config-decisions"><div className="field"><label htmlFor="question-count">Cantidad de preguntas</label><input id="question-count" type="number" min={3} max={20} value={countInput} onChange={e=>setCountInput(e.target.value)} onFocus={()=>setQuantityTouched(false)} onBlur={()=>{setQuantityTouched(true);if(Number.isInteger(count)&&count>=3&&count<=20)setCountInput(String(count));}} aria-describedby="question-count-help" aria-invalid={quantityTouched&&(!Number.isInteger(count)||count<3||count>20)}/><small id="question-count-help">De 3 a 20 preguntas. Puedes vaciar el campo y escribir otra cantidad.</small></div></div><label className="switch-field"><span><strong>Enviar puntuación a Moodle</strong><small>{scored?"De 0 a 100 · Aprobación desde 70.":"Registrar finalización sin nota."}</small></span><input type="checkbox" checked={scored} onChange={e=>setScored(e.target.checked)} role="switch"/><span className="switch-track" aria-hidden="true"/></label><p className="studio-help">La IA utiliza únicamente el material académico referenciado. El borrador pasa por reglas de calidad y queda abierto a edición docente.</p></div>}
        {step===4&&quiz&&<><QuizStudio quiz={quiz} onChange={changeQuiz} busy={busy} onRegenerate={regenerate} onRegenerateAll={()=>generate(true)} onEditingChange={setEditing} generated={!!artifact} origin={session.quizOrigin}/><CreateRoulette disabled={!state.valid||busy||editing}/><section className="package-panel" aria-labelledby="package-title"><div><Package size={24}/><h3 id="package-title">Del estudio al aula.</h3></div><p id="generation-reason" role="status">{editing?"Guarda o cancela la edición abierta antes de generar el paquete.":state.reason}</p><div className="studio-toolbar"><Button disabled={!state.enabled} aria-describedby="generation-reason" onClick={buildPackage}>{busy&&stage>=0?packageStages[Math.min(stage,3)]:"Generar SCORM 1.2"}<ArrowRight size={16}/></Button><Button variant="secondary" disabled={!state.enabled} onClick={()=>setPreview(!preview)}><Eye size={16}/>{preview?"Cerrar vista previa":"Vista previa"}</Button></div>{(stage>=0||progressFailure?.id.startsWith("package-"))&&<PipelineProgress label="Preparación del SCORM" steps={packageStages.map((label,i)=>({id:`package-${i}`,label,status:progressFailure?.id===`package-${i}`?"error":stage>i?"complete":stage===i?"running":"pending",detail:progressFailure?.id===`package-${i}`?progressFailure.detail:undefined}))}/>}{(artifact||workspace?.package)&&!editing&&!busy&&<div className="package-ready" role="status"><h4>Paquete listo</h4><strong>{quiz.title}</strong><p>{quiz.questions.length} preguntas · SCORM 1.2 · Seguimiento activado · {quiz.scored?`Puntuación activada · Aprobación: ${quiz.passingScore}/100`:"Sin puntuación"} · {((artifact?.size??workspace?.package?.file_size??0)/1024).toFixed(1)} KB</p><div className="studio-toolbar"><Button variant="secondary" onClick={()=>setPreview(true)}><Eye size={16}/>Preview</Button><Button onClick={downloadStored}><Download size={16}/>Descargar SCORM 1.2</Button></div></div>}{preview&&state.valid&&!editing&&<iframe className="quiz-preview" title="Vista previa del quiz educativo" sandbox="allow-scripts" srcDoc={artifact?.html??renderQuiz(quiz,true)}/>}</section></>}
        {step===3&&activity!=="TIMELINE"&&activity!=="SIMULATION"&&prepared&&<><AssessmentPreparation prepared={prepared} plan={plan} count={count} activity={activity}/>{planError&&<div className="assessment-problem" role={Number.isInteger(count)?"alert":"status"}><p>{planError}</p>{availableCount!==null&&availableCount>=3&&availableCount<=20&&<Button variant="secondary" onClick={()=>setCountInput(String(availableCount))}>Preparar {availableCount} preguntas</Button>}<Button variant="ghost" onClick={()=>go(0)}>Cambiar PDF</Button></div>}<details className="manual-writing"><summary>Prefiero redactar las preguntas</summary><p>Abre un borrador con las fuentes del documento para escribir y revisar tus preguntas.</p><Button variant="secondary" disabled={busy||!Number.isInteger(count)||count<3||count>20} onClick={manual}>Crear preguntas manualmente</Button></details></>}
        {step===3&&generationFailed&&<div className="studio-validation" role="status"><p>El análisis y el plan siguen disponibles. Puedes reintentar la redacción o completar las preguntas en el editor.</p><Button disabled={busy||!plan} onClick={()=>generate(true)}>Reintentar generación</Button></div>}
        {step===3&&quiz&&<div className="studio-validation"><p>Volver al borrador no llama a la IA. Los cambios se guardan en tu cuenta. Para aplicar otra configuración, solicita una regeneración explícita.</p><Button variant="secondary" disabled={busy||!plan} onClick={()=>generate(true)}>Regenerar con esta configuración</Button></div>}
      </motion.div></AnimatePresence>
      {step<4&&!(["TIMELINE","SIMULATION"].includes(activity)&&step>=2)&&(prepared||busy||progressFailure)&&<PipelineProgress label="Preparación de la evaluación" steps={[{id:"document",label:"Documento procesado",done:!!extracted||!!prepared,running:contentStage==="preparing"},{id:"content",label:"Contenido preparado",done:!!prepared},{id:"concepts",label:"Conceptos seleccionados",done:!!prepared},{id:"assessment",label:"Evaluación preparada",done:!!plan},{id:"writing",label:contentStage==="writing"?"Generando preguntas":"Preguntas redactadas",done:!!quiz,running:contentStage==="writing"},{id:"validation",label:"Actividad validada",done:!!quiz,running:contentStage==="validating"}].map(item=>({id:item.id,label:item.label,status:(progressFailure?.id===item.id?"error":busy&&item.running?"running":item.done?"complete":"pending") as ProgressStatus,detail:progressFailure?.id===item.id?progressFailure.detail:undefined}))}/>}
      {step===4&&(contentStage==="writing"||progressFailure?.id==="writing")&&<PipelineProgress steps={[{id:"writing",label:"Actualizar pregunta",status:progressFailure?.id==="writing"?"error":"running",detail:progressFailure?.id==="writing"?progressFailure.detail:undefined}]}/>}{(busy||message)&&<div className="intelligence-status" role="status"><p>{message}</p>{busy&&<Button variant="ghost" onClick={()=>{controller.current?.abort();session.cancel();}}>Cancelar solicitud</Button>}</div>}<p ref={errorSummary} tabIndex={-1} className="field-error" role="alert">{error}</p>
      <div className="wizard-actions">{step>0?<Button variant="ghost" disabled={busy||editing} onClick={()=>go(step-1)}><ArrowLeft size={16}/>Anterior</Button>:<ButtonLink href="/" variant="ghost"><ArrowLeft size={16}/>Mi estudio</ButtonLink>}<span>{step+1} de 5</span>{step<4&&!(step===3&&["TIMELINE","SIMULATION"].includes(activity))&&!(step===0&&selection)&&<Button disabled={busy||(step===0&&!selection?.file)||(step===1&&!analysis)||(step===3&&!plan)} onClick={step===3?()=>generate():()=>go(step+1)}>{step===3?(quiz?"Volver al borrador":"Generar evaluación"):"Continuar"}<ArrowRight size={16}/></Button>}</div>
    </section>{step!==4&&<aside className="creation-companion"><span className="companion-orbit" aria-hidden="true"><FileText size={28}/><ArrowRight size={20}/><Sparkles size={27}/></span><h3>Del conocimiento<br/>a la curiosidad.</h3><p>Primero comprender. Después preguntar. Cada respuesta regresa a su fuente.</p><div className="companion-choice"><span>Tu experiencia</span><strong>{activity==="SIMULATION"?"Simulación":activity==="TIMELINE"?"Línea de tiempo":activity==="ROULETTE"?"Ruleta educativa":"Quiz educativo"}</strong><ActivityMotif kind={activity==="SIMULATION"?"decisions":activity==="TIMELINE"?"timeline":activity==="ROULETTE"?"wheel":"quiz"}/></div><p className="companion-note">Proyecto independiente.<br/>Sin afiliación institucional.</p></aside>}</div></div>;
}
