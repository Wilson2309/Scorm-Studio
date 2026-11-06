"use client";
import "./workspace.css";
import {useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {Download,FileText,Plus,Search,ArrowRight,Eye,Package,Trash2,RefreshCw} from "lucide-react";
import {Button,ButtonLink,EmptyState,PageHeader} from "@/components/ui/primitives";
import {useDocumentSelection} from "@/components/generator/document-context";
import {historyFiltersSchema,historyLabels,historyResultSchema,historyURL,type HistoryFilters,type HistoryItem} from "@/lib/workspace/history-contracts";
import {workspaceCommand,workspaceRequest} from "@/lib/workspace/client";
import {parseWorkspaceSnapshot} from "@/lib/workspace/contracts";
import {renderActivity,validateActivity} from "@/lib/activities/registry";
import {useWorkspaceQuery} from "./use-workspace-query";
import {WorkspaceDialog} from "./workspace-dialog";
import {PersistentStatus,workspaceDate} from "./history-presentation";

export function HistoryView(){
 const router=useRouter(),params=useSearchParams(),parsed=historyFiltersSchema.safeParse(Object.fromEntries(params)),filters=parsed.success?parsed.data:historyFiltersSchema.parse({});
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[remove,setRemove]=useState<HistoryItem|null>(null),[preview,setPreview]=useState<{html:string;title:string}|null>(null);
 const {flushSaves,openWorkspace,getWorkspace,setDocument}=useDocumentSelection();
 const result=useWorkspaceQuery(`/api/workspace/history?${historyURL(filters)}`,historyResultSchema,revision),data=result.data;
 const change=(patch:Partial<HistoryFilters>)=>router.replace(`/historial?${historyURL({...filters,page:1,...patch})}`,{scroll:false});
 const refresh=()=>setRevision(r=>r+1);
 async function action(item:HistoryItem,kind:"open"|"preview"|"package"|"download"|"delete"){
  if(busy)return;setBusy(item.id);setError("");setMessage("");
  try{
   await flushSaves();
   if(kind==="delete"){await workspaceRequest(`/api/workspace/${item.id}`,{method:"DELETE"});if(getWorkspace()?.generationId===item.id)setDocument(null);setRemove(null);setMessage("Actividad eliminada junto con sus archivos exclusivos.");refresh();return;}
   if(kind==="open"&&item.type==="SIMULATION"){router.push(`/simulacion?generation=${item.id}`);return;}
   if(kind==="open"&&item.type==="TIMELINE"){router.push(`/linea-de-tiempo?generation=${item.id}`);return;}
   if(kind==="open"&&item.type==="ROULETTE"){router.push(`/ruleta?generation=${item.id}`);return;}
   if(kind==="open"){await openWorkspace(item.id,true);router.push(`/crear?generation=${item.id}`);return;}
   if(kind==="download"){
    const response=await fetch(`/api/workspace/${item.id}/download`,{cache:"no-store"});
    if(!response.ok){const body=await response.json();throw new Error(body.error||"No se pudo descargar. Recupera la actividad y genera el paquete actual.");}
    const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=`scorm-${item.id}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Descarga de la revisión vigente preparada.");return;
   }
   const response=await workspaceRequest(`/api/workspace/${item.id}`) as {snapshot:unknown},snapshot=parseWorkspaceSnapshot(response.snapshot);
   if(!snapshot.quiz&&!snapshot.timeline&&!snapshot.simulation)throw new Error("Esta actividad aún no tiene contenido. Continúa su preparación en el asistente.");
   const quality=validateActivity(snapshot.quiz,snapshot.simulation??snapshot.timeline??snapshot.activity,snapshot.prepared.document.fragments);if(!quality.valid)throw new Error(`Resuelve ${quality.issues.filter(i=>i.severity==="BLOCKING").length} bloqueos en el editor antes de previsualizar o generar.`);
   if(kind==="preview")setPreview({html:renderActivity(snapshot.quiz,snapshot.simulation??snapshot.timeline??snapshot.activity,true,snapshot.prepared.document.fragments),title:snapshot.generation.title});
   else{await workspaceCommand(item.id,{action:"package",expectedRevision:snapshot.generation.current_revision,operationId:crypto.randomUUID()});setMessage(`SCORM de la revisión ${snapshot.generation.current_revision} guardado. Ya puedes descargarlo.`);refresh();}
  }catch(e){setError(e instanceof Error?e.message:"No se pudo completar la acción. Vuelve a intentarlo.");if(kind!=="open")refresh();}
  finally{setBusy(null);}
 }
 return <section className="persistent-history" data-history-state={result.error?"error":data?"ready":"loading"}>
  <PageHeader eyebrow="Tu biblioteca" title="Cada idea, en su lugar." description="Tu trabajo guardado. Recupera una actividad y continúa donde la dejaste." action={<ButtonLink href="/crear"><Plus size={17}/>Crear actividad</ButtonLink>}/>
  <form className="history-toolbar" key={historyURL(filters)} onSubmit={e=>{e.preventDefault();change({q:String(new FormData(e.currentTarget).get("q")??"").trim().slice(0,100)});}}>
   <label className="search-field"><Search size={18} aria-hidden="true"/><span className="sr-only">Buscar por título</span><input id="history-search" name="q" type="search" maxLength={100} defaultValue={filters.q} placeholder="Buscar por título…"/></label><Button type="submit" variant="secondary">Buscar</Button>
   <label className="filter-field" htmlFor="history-status">Estado<select id="history-status" value={filters.status} onChange={e=>change({status:e.target.value as HistoryFilters["status"]})}><option value="ALL">Todos</option>{Object.entries(historyLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label className="filter-field" htmlFor="history-order">Orden<select id="history-order" value={filters.order} onChange={e=>change({order:e.target.value as HistoryFilters["order"]})}><option value="updated_desc">Última modificación</option><option value="created_desc">Más recientes</option><option value="created_asc">Más antiguas</option></select></label>
  </form>
  {!parsed.success&&<p role="alert" className="field-error">Los filtros del enlace no son válidos. <Button variant="ghost" onClick={()=>router.replace("/historial")}>Restablecer filtros</Button></p>}
  {(error||result.error)&&<div className="history-notice" role="alert"><p>{error||result.error}</p><Button variant="secondary" onClick={()=>{setError("");refresh();}}><RefreshCw size={16}/>Actualizar biblioteca</Button></div>}
  {message&&<p className="history-notice" role="status">{message}</p>}
  {!data&&!result.error&&<div className="history-skeleton" role="status" aria-label="Cargando actividades"><p>Recuperando tu biblioteca…</p>{[0,1,2].map(i=><div key={i}/>)}</div>}
  {data&&<><p className="result-count" aria-live="polite">{data.total} {data.total===1?"actividad":"actividades"} · Página {data.filters.page} de {Math.max(1,Math.ceil(data.total/data.filters.pageSize))}</p>
   {data.items.length?<div className="history-table"><table><caption className="sr-only">Actividades privadas de tu cuenta, con la revisión y el paquete vigentes</caption><thead><tr><th>Actividad y documento</th><th>Revisión</th><th>Fechas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id} data-activity-id={item.id}><td><span className="table-icon table-icon-quiz"><FileText size={20}/></span><div><strong>{item.title}</strong><small>{item.document}</small><small>{item.type==="SIMULATION"?"Simulación":item.type==="TIMELINE"?"Línea de tiempo":item.type==="ROULETTE"?"Ruleta":"Quiz"} · {item.questions} {item.type==="SIMULATION"?"escenas":item.type==="TIMELINE"?"hitos":"retos"}</small></div></td><td data-label="Revisión">{item.revision?`R${item.revision}`:"Sin borrador"}<small>{item.hasPackage?"ZIP vigente":"Sin ZIP vigente"}</small></td><td className="history-dates"><span>Creada <time dateTime={item.createdAt}>{workspaceDate(item.createdAt)}</time></span><small>Modificada <time dateTime={item.updatedAt}>{workspaceDate(item.updatedAt)}</time></small></td><td><PersistentStatus item={item}/></td><td><div className="history-row-actions">
    {!item.deleting&&<><Button variant="ghost" disabled={!!busy} onClick={()=>action(item,"open")}>Continuar<ArrowRight size={15}/></Button><details><summary className="button button-ghost">Más acciones</summary><div className="history-action-menu"><Button variant="ghost" disabled={!!busy||!item.questions} onClick={()=>action(item,"preview")}><Eye size={16}/>Previsualizar</Button><Button variant="ghost" disabled={!!busy||!item.questions} onClick={()=>action(item,"package")}><Package size={16}/>Generar SCORM</Button><Button variant="ghost" disabled={!!busy||!item.hasPackage} onClick={()=>action(item,"download")}><Download size={16}/>Descargar ZIP</Button><Button variant="ghost" disabled={!!busy} onClick={()=>{setError("");setRemove(item);}}><Trash2 size={16}/>Eliminar actividad</Button></div></details></>}
    {item.deleting&&<Button variant="ghost" disabled={!!busy} onClick={()=>setRemove(item)}>Reintentar eliminación</Button>}{busy===item.id&&<span role="status">Procesando…</span>}
   </div></td></tr>)}</tbody></table></div>:<><EmptyState title={filters.q||filters.status!=="ALL"?"No hay coincidencias":"Tu biblioteca empieza aquí"} description={filters.q||filters.status!=="ALL"?"Busca otro título o cambia el estado para encontrar tu actividad.":"Sube tu primer PDF. Tu actividad, las ediciones y los paquetes quedarán guardados en tu cuenta."}/><div className="history-empty-action">{filters.q||filters.status!=="ALL"?<Button variant="secondary" onClick={()=>router.replace("/historial")}>Limpiar filtros</Button>:<ButtonLink href="/crear">Crear mi primera actividad<ArrowRight size={16}/></ButtonLink>}</div></>}
   {data.total>data.filters.pageSize&&<nav className="history-pagination" aria-label="Páginas de actividades"><Button variant="secondary" disabled={data.filters.page===1||!!busy} onClick={()=>change({page:data.filters.page-1})}>Anterior</Button><span>Página {data.filters.page}</span><Button variant="secondary" disabled={data.filters.page*data.filters.pageSize>=data.total||!!busy} onClick={()=>change({page:data.filters.page+1})}>Siguiente</Button></nav>}
  </>}
  <div className="history-footnote"><FileText size={17}/><p>Los archivos son privados. Editar una actividad requiere generar un nuevo ZIP para incluir los cambios.</p></div>
  {remove&&<WorkspaceDialog title="Eliminar actividad" busy={!!busy} onClose={()=>setRemove(null)}><p>Se eliminará <strong>{remove.title}</strong>, sus revisiones y paquetes. El PDF se conserva si otra actividad lo utiliza.</p><p>Esta acción no se puede deshacer.</p>{error&&<p role="alert" className="field-error">{error}</p>}<div className="studio-toolbar"><Button variant="secondary" disabled={!!busy} onClick={()=>setRemove(null)}>Conservar actividad</Button><Button className="button-danger" disabled={!!busy} onClick={()=>action(remove,"delete")}>Eliminar definitivamente</Button></div></WorkspaceDialog>}
  {preview&&<WorkspaceDialog title={preview.title} onClose={()=>setPreview(null)}><p>Vista previa de la revisión guardada. No registra progreso en Moodle.</p><iframe className="history-preview quiz-preview" title="Vista previa de actividad guardada" sandbox="allow-scripts" srcDoc={preview.html}/></WorkspaceDialog>}
 </section>;
}
