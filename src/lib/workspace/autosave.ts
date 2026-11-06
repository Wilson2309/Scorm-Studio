export type SaveStatus="saved"|"pending"|"saving"|"error"|"conflict";
export type SaveState={status:SaveStatus;revision:number;message:string};
/** One writer per activity. Edits arriving during a save are coalesced, never overwritten. */
export class DraftAutosave<T>{
 private pending:{value:T;serial:number}|null=null;
 private serial=0;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private running:Promise<void>|null=null;
 state:SaveState;
 constructor(revision:number,private write:(value:T,expected:number)=>Promise<{revision:number}>,private notify:(state:SaveState)=>void,private delay=800){this.state={status:"saved",revision,message:"Guardado"};}
 private set(status:SaveStatus,message:string){this.state={...this.state,status,message};this.notify(this.state);}
 schedule(value:T,paused=false){this.pending={value,serial:++this.serial};if(this.timer)clearTimeout(this.timer);
  if(paused){this.set("error","Las preguntas siguen aquí. Reintenta guardar para conservarlas en tu cuenta.");return;}
  if(this.state.status==="conflict")return;
  this.set("pending","Cambios pendientes");this.timer=setTimeout(()=>{this.timer=null;void this.flush().catch(()=>{});},this.delay);
 }
 hasPending(){return !!this.pending||!!this.running;}
 discard(){if(this.timer)clearTimeout(this.timer);this.timer=null;this.pending=null;this.set("saved","Cambios locales descartados");}
 async flush():Promise<void>{
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  if(this.state.status==="conflict")throw new Error(this.state.message);
  if(this.running){await this.running;if(this.pending)return this.flush();return;}
  if(!this.pending)return;
  const captured=this.pending;this.set("saving","Guardando…");
  const task=(async()=>{
   try{const result=await this.write(captured.value,this.state.revision);this.state={...this.state,revision:result.revision};
    if(this.pending?.serial===captured.serial)this.pending=null;this.set(this.pending?"pending":"saved",this.pending?"Cambios pendientes":"Guardado");
   }catch(error){const e=error as {code?:string;message?:string};this.set(e.code==="revision_conflict"?"conflict":"error",e.message??"Error al guardar. Tus cambios siguen en esta sesión.");throw error;}
  })();this.running=task;
  try{await task;}finally{if(this.running===task)this.running=null;}
  if(this.pending)return this.flush();
 }
}
