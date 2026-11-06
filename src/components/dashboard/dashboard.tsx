"use client";
import "@/features/history/workspace.css";
import Link from "next/link";
import {useState} from "react";
import {useRouter} from "next/navigation";
import { ArrowRight, ArrowUpRight, FileText, Layers } from "lucide-react";
import { Button,ButtonLink,EmptyState,TextLink } from "@/components/ui/primitives";
import { PDFDropzone } from "@/components/generator/pdf-dropzone";
import { ActivityMotif } from "@/components/generator/activity-motif";
import { useDocumentSelection } from "@/components/generator/document-context";
import {workspaceSummarySchema,type HistoryItem} from "@/lib/workspace/history-contracts";
import {PersistentStatus,workspaceDate} from "@/features/history/history-presentation";
import {useWorkspaceQuery} from "@/features/history/use-workspace-query";

export function StatsCard({ value, label }: { value: string; label: string; icon?: typeof Layers }) {
  return <div className="studio-stat"><strong>{value}</strong><span>{label}</span></div>;
}
export function RecentGenerationCard({ activity }: { activity: HistoryItem }) {
  const router=useRouter(),{flushSaves,openWorkspace}=useDocumentSelection(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function open(){if(busy)return;setBusy(true);setError("");try{await flushSaves();if(activity.type==="SIMULATION"){router.push(`/simulacion?generation=${activity.id}`);return;}if(activity.type==="TIMELINE"){router.push(`/linea-de-tiempo?generation=${activity.id}`);return;}if(activity.type==="ROULETTE"){router.push(`/ruleta?generation=${activity.id}`);return;}await openWorkspace(activity.id,true);router.push(`/crear?generation=${activity.id}`);}catch(e){setError(e instanceof Error?e.message:"No se pudo recuperar la actividad.");}finally{setBusy(false);}}
  return <Link href={activity.deleting?"/historial":`${activity.type==="SIMULATION"?"/simulacion":activity.type==="TIMELINE"?"/linea-de-tiempo":activity.type==="ROULETTE"?"/ruleta":"/crear"}?generation=${activity.id}`} aria-disabled={busy} onClick={e=>{if(activity.deleting||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();void open();}} className="creation-card creation-quiz">
    <div className="creation-card-visual"><ActivityMotif kind={activity.type==="SIMULATION"?"decisions":activity.type==="TIMELINE"?"timeline":activity.type==="ROULETTE"?"wheel":"quiz"} /><span>{activity.type==="SIMULATION"?"Simulación":activity.type==="TIMELINE"?"Línea de tiempo":activity.type==="ROULETTE"?"Ruleta educativa":"Quiz educativo"}</span><span className="creation-open"><ArrowUpRight size={19} /></span></div>
    <div className="creation-card-body"><div className="creation-card-meta"><span>{activity.questions} {activity.type==="SIMULATION"?"escenas":activity.type==="TIMELINE"?"hitos":"preguntas"} · R{activity.revision}</span><PersistentStatus item={activity} /></div>
      <h3>{activity.title}</h3><p><FileText size={14} />{activity.document}</p><small>{workspaceDate(activity.updatedAt)}</small>{busy&&<p role="status">Recuperando actividad…</p>}{error&&<p role="alert" className="field-error">{error}</p>}
    </div>
  </Link>;
}
export function Dashboard({fullName="Docente"}:{fullName?:string}) {
  const { document, setDocument } = useDocumentSelection();
  const [refresh,setRefresh]=useState(0),result=useWorkspaceQuery("/api/workspace/summary",workspaceSummarySchema,refresh),summary=result.data;
  return <>
    <section className="studio-hero" aria-labelledby="studio-title">
      <div className="studio-intro">
        <p className="studio-greeting">Tu estudio, {fullName.split(/\s+/)[0]}. Tus próximas ideas.</p>
        <h1 id="studio-title">El conocimiento<br />toma otra forma.</h1>
        <p className="studio-statement">De un documento a una experiencia que invita a aprender. Diseña una nueva manera de llevar tus ideas al aula.</p>
        <div className="studio-intro-actions"><ButtonLink href="/crear" variant="secondary">Explorar el asistente<ArrowRight size={17} /></ButtonLink><span>Creado para docentes.<br />Abierto a tus ideas.</span></div>
        <div className="format-teaser"><div className="format-teaser-art"><ActivityMotif kind="quiz" /></div><p>Un PDF. Tu próxima actividad.<span>Quiz, revisión docente y SCORM para el aula.</span></p></div>
      </div>
      <div className="studio-creation"><div className="creation-caption"><span>La materia prima: tu contenido</span><span className="studio-live-dot" aria-hidden="true" /></div>
        <PDFDropzone value={document} onChange={setDocument} compact action={<ButtonLink href="/crear">Diseñar actividad<ArrowRight size={17} /></ButtonLink>} />
        <p className="creation-local-note">Quiz real · El PDF se envía al servidor cuando eliges extraer su contenido.</p>
      </div>
    </section>
    <section className="transformation-strip" aria-label="Del documento al aula, visión del producto">
      {["Documento", "Comprender", "Diseñar", "Experiencia", "Moodle"].map((label, i) => <div key={label}><span className={i === 0 ? "transformation-current" : ""}>{label}</span>{i < 4 && <ArrowRight size={16} aria-hidden="true" />}</div>)}
      <small>Del primer borrador a tu aula</small>
    </section>
    <section className="studio-recents" aria-labelledby="recent-title">
      <div className="studio-section-heading"><div><h2 id="recent-title">Ideas que ya toman forma</h2><p>Retoma una creación o encuentra tu próximo punto de partida.</p></div><TextLink href="/historial">Tu historial</TextLink></div>
      {result.error?<div className="history-notice" role="alert"><p>{result.error}</p><Button variant="secondary" onClick={()=>setRefresh(r=>r+1)}>Volver a consultar</Button></div>:!summary?<p role="status">Consultando tus actividades…</p>:<div className="studio-recent-layout" data-workspace-summary><div className="studio-recent-grid">{summary.recent.length?summary.recent.map(activity => <RecentGenerationCard key={activity.id} activity={activity} />):<EmptyState title="Tu primera idea empieza con un PDF" description="Todavía no tienes actividades guardadas. Elige un documento arriba para comenzar."/>}</div><aside className="studio-library-note"><span className="library-monogram" aria-hidden="true">Aa<ArrowUpRight size={26} /></span><h3>Tu biblioteca,<br />a tu ritmo.</h3><div className="studio-library-stats"><StatsCard value={String(summary.total)} label="actividades" /><StatsCard value={String(summary.pending)} label="borradores pendientes" /><StatsCard value={String(summary.packages)} label="SCORM vigentes" /></div><p>Tu contenido y tus ediciones, guardados de forma privada.</p><Link href="/historial">Abrir biblioteca<ArrowUpRight size={17} /></Link></aside></div>}
    </section>
  </>;
}
