"use client";
import {useEffect,useRef,type ReactNode} from "react";
import {X} from "lucide-react";
import {Button} from "@/components/ui/primitives";
export function WorkspaceDialog({title,children,onClose,busy=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const prior=document.activeElement;dialog.current?.showModal();return()=>{if(prior instanceof HTMLElement&&prior.isConnected)prior.focus();};},[]);
 return <dialog ref={dialog} className="workspace-dialog" aria-labelledby="workspace-dialog-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><div className="workspace-dialog-heading"><h2 id="workspace-dialog-title">{title}</h2><Button variant="ghost" disabled={busy} aria-label="Cerrar diálogo" onClick={onClose}><X size={19}/></Button></div>{children}</dialog>;
}
