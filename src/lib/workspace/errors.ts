export class WorkspaceError extends Error{
 constructor(readonly status:number,readonly code:string,message:string,readonly databaseCode?:string){super(message);}
}
export function workspaceFailure(error:unknown):never{
 if(error instanceof WorkspaceError)throw error;
 const e=error&&typeof error==="object"?error as {code?:string;status?:number;statusCode?:string}:{};
 if(["PGRST202","PGRST205","42P01","42883"].includes(e.code??""))throw new WorkspaceError(503,"migration_pending","El espacio persistente está pendiente de activación. No se ha perdido tu selección.");
 if(e.code==="42501")throw new WorkspaceError(404,"not_found","La actividad no está disponible en tu cuenta.");
 if(e.code==="PT409"||e.code==="40001")throw new WorkspaceError(409,"revision_conflict","Hay una revisión más reciente. Tus cambios siguen aquí; recupera la actividad antes de reemplazarlos.");
 if(e.code==="55P03")throw new WorkspaceError(409,"operation_busy","La actividad tiene una operación pendiente. Espera a que termine antes de continuar.");
 if(e.status===401||e.statusCode==="401"||e.code==="PGRST301")throw new WorkspaceError(401,"session_expired","Tu sesión ha caducado. Vuelve a entrar para continuar guardando.");
 throw new WorkspaceError(503,"storage_unavailable","No se pudo guardar el trabajo. Puedes reintentar sin volver a generar las preguntas.",e.code);
}
