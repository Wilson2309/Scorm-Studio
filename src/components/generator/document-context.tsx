"use client";
import { createContext, useCallback, useContext, useState, useRef, useEffect, type ReactNode } from "react";
import type { DocumentSelection } from "./pdf-dropzone";
import { DocumentSession } from "@/lib/content/document-session";
import type {StudioQuiz} from "@/lib/content/schema";
import type {ExtractedDocument} from "@/lib/quiz/schema";
import {dehydrateQuiz,parseWorkspaceSnapshot,type WorkspaceSnapshot,type WorkspaceMeta,type WorkspacePackage} from "@/lib/workspace/contracts";
import {DraftAutosave,type SaveState} from "@/lib/workspace/autosave";
import {workspaceRequest,workspaceCommand} from "@/lib/workspace/client";
import {z} from "zod";

const DocumentContext = createContext<{
  document: DocumentSelection | null;
  setDocument: (document: DocumentSelection | null) => void;
  session: DocumentSession;
  workspace:WorkspaceMeta|null;
  saveState:SaveState;
  getWorkspace:()=>WorkspaceMeta|null;
  acceptWorkspace:(snapshot:WorkspaceSnapshot,extracted?:ExtractedDocument|null)=>void;
  openWorkspace:(id:string,discard?:boolean)=>Promise<void>;
  queueSave:(quiz:StudioQuiz,operationId?:string,paused?:boolean)=>void;
  flushSaves:()=>Promise<void>;
  discardSaves:()=>void;
  registerExternalSave:(id:string,save:Pick<DraftAutosave<never>,"flush"|"hasPending"|"discard">)=>()=>void;
  uploadIntent:()=>{documentId:string;generationId:string};
  rememberPackage:(value:WorkspacePackage)=>void;
} | null>(null);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [state,setState]=useState<{document:DocumentSelection|null;session:DocumentSession;workspace:WorkspaceMeta|null}>(()=>({document:null,session:new DocumentSession(),workspace:null}));
  const latest=useRef(state),controllers=useRef(new Map<string,DraftAutosave<{quiz:StudioQuiz;origin:"ai"|"manual";operationId?:string}>>()),intent=useRef<{documentId:string;generationId:string}|null>(null);
  const loading=useRef(new Map<string,Promise<void>>());
  const pendingOperations=useRef(new Map<string,string>());
  const externalSaves=useRef(new Map<string,Pick<DraftAutosave<never>,"flush"|"hasPending"|"discard">>());
  const [saveState,setSaveState]=useState<SaveState>({status:"saved",revision:0,message:""}),[transitionError,setTransitionError]=useState("");
  const replace=useCallback((next:typeof state)=>{latest.current=next;setState(next);},[]);
  const flushSaves=useCallback(async()=>{for(const save of [...controllers.current.values(),...externalSaves.current.values()])await save.flush();},[]);
  const discardSaves=useCallback(()=>{for(const save of [...controllers.current.values(),...externalSaves.current.values()])save.discard();},[]);
  const registerExternalSave=useCallback((id:string,save:Pick<DraftAutosave<never>,"flush"|"hasPending"|"discard">)=>{externalSaves.current.set(id,save);return()=>{if(!save.hasPending()&&externalSaves.current.get(id)===save)externalSaves.current.delete(id);};},[]);
  const ensure=useCallback((meta:WorkspaceMeta)=>{
   const existing=controllers.current.get(meta.generationId);if(existing)return existing;
   const save=new DraftAutosave<{quiz:StudioQuiz;origin:"ai"|"manual";operationId?:string}>(meta.revision,async(value,expected)=>{
    const operationId=value.operationId??pendingOperations.current.get(meta.generationId);
    const result=z.object({revision:z.number().int()}).parse(await workspaceCommand(meta.generationId,{action:"save",expectedRevision:expected,quiz:dehydrateQuiz(value.quiz).quiz,origin:value.origin,...(operationId?{operationId}:{})}));
    pendingOperations.current.delete(meta.generationId);
    return result;
   },saved=>{if(latest.current.workspace?.generationId===meta.generationId){const prior=latest.current;const next={...prior,workspace:{...prior.workspace!,revision:saved.revision,...(saved.status==="saved"?{}:{package:null})}};replace(next);setSaveState(saved);}});
   controllers.current.set(meta.generationId,save);return save;
  },[replace]);
  const acceptWorkspace=useCallback((snapshot:WorkspaceSnapshot,extracted?:ExtractedDocument|null)=>{
   const previous=latest.current,session=previous.session;
   session.understanding={document:snapshot.prepared.document,analysis:snapshot.prepared.analysis,prepared:snapshot.prepared};
   if(extracted)session.extracted=extracted;session.quiz=snapshot.quiz;session.setOrigin(snapshot.origin);
   const meta:WorkspaceMeta={activityType:snapshot.generation.activity_type,documentId:snapshot.document.id,generationId:snapshot.generation.id,revision:snapshot.generation.current_revision,origin:snapshot.origin,package:snapshot.package,activeOperation:snapshot.generation.active_operation};
   controllers.current.get(meta.generationId)?.discard();controllers.current.delete(meta.generationId);
   pendingOperations.current.delete(meta.generationId);
   const saved=ensure(meta);setSaveState(saved.state);intent.current={documentId:meta.documentId,generationId:meta.generationId};
   replace({...previous,document:previous.document?.name===snapshot.document.filename?{...previous.document,persisted:true}:{name:snapshot.document.filename,size:snapshot.document.file_size,persisted:true},workspace:meta});
  },[ensure,replace]);
  const openWorkspace=useCallback(async(id:string,discard=false)=>{
   if(loading.current.has(id))return loading.current.get(id)!;
   const pending=(async()=>{
    if(discard)discardSaves();else await flushSaves();
    if(!discard&&latest.current.workspace?.generationId===id&&latest.current.session.understanding)return;
    const response=z.object({snapshot:z.unknown()}).parse(await workspaceRequest(`/api/workspace/${id}`));const snapshot=parseWorkspaceSnapshot(response.snapshot);
    latest.current.session.cancel();replace({document:null,session:new DocumentSession(latest.current.session.id+1),workspace:null});
    acceptWorkspace(snapshot);
   })().finally(()=>loading.current.delete(id));loading.current.set(id,pending);return pending;
  },[acceptWorkspace,discardSaves,flushSaves,replace]);
  const setDocument=useCallback((document:DocumentSelection|null)=>{void (async()=>{
   try{await flushSaves();setTransitionError("");latest.current.session.cancel();intent.current=null;replace({document,session:new DocumentSession(latest.current.session.id+1),workspace:null});setSaveState({status:"saved",revision:0,message:""});}
   catch{setTransitionError("No se cambió el documento porque hay trabajo sin guardar. Vuelve a la actividad y reintenta el guardado.");}
  })();},[flushSaves,replace]);
  const queueSave=useCallback((quiz:StudioQuiz,operationId?:string,paused=false)=>{
   const s=latest.current;if(!s.workspace)return;s.session.cacheQuiz(quiz);
   if(operationId)pendingOperations.current.set(s.workspace.generationId,operationId);
   ensure(s.workspace).schedule({quiz,origin:s.session.quizOrigin,...(operationId?{operationId}:{})},paused);
  },[ensure]);
  useEffect(()=>{const saves=controllers.current;
   const pending=()=>[...saves.values(),...externalSaves.current.values()].some(s=>s.hasPending());
   const before=(event:BeforeUnloadEvent)=>{if(pending()){event.preventDefault();event.returnValue="";}};
   const hidden=()=>{if(document.visibilityState==="hidden")void flushSaves().catch(()=>{});};
   window.addEventListener("beforeunload",before);document.addEventListener("visibilitychange",hidden);
   return()=>{window.removeEventListener("beforeunload",before);document.removeEventListener("visibilitychange",hidden);};
  },[flushSaves]);
  return <DocumentContext.Provider value={{...state,setDocument,saveState,getWorkspace:()=>latest.current.workspace,acceptWorkspace,openWorkspace,queueSave,flushSaves,discardSaves,registerExternalSave,
   rememberPackage:value=>{const prior=latest.current;if(prior.workspace?.generationId===value.generation_id&&prior.workspace.revision===value.revision)replace({...prior,workspace:{...prior.workspace,package:value}});},
   uploadIntent:()=>{if(!intent.current)intent.current={documentId:crypto.randomUUID(),generationId:crypto.randomUUID()};return intent.current;}}}>
   {children}{transitionError&&<aside className="workspace-save-notice" role="alert">{transitionError}</aside>}
  </DocumentContext.Provider>;
}
export function useDocumentSelection() {
  const context = useContext(DocumentContext);
  if (!context) throw new Error("Document selection requires DocumentProvider");
  return context;
}
