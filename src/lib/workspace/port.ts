export type WorkspaceTable="documents"|"generations"|"quiz_revisions"|"quiz_drafts"|"scorm_packages"|"generation_events";
export type WorkspaceRPC="workspace_create_document"|"workspace_prepare_document"|"workspace_create_generation"|"workspace_save_draft"|"workspace_claim_operation"|"workspace_finish_generation"|"workspace_fail_operation"|"workspace_release_operation"|"workspace_reserve_package"|"workspace_finish_package"|"workspace_begin_delete"|"workspace_finish_delete";
export type WorkspaceBucket="scorm-pdfs"|"scorm-packages";
export interface WorkspacePort{
 read(table:WorkspaceTable,filters:Record<string,string|number>,limit?:number):Promise<unknown[]>;
 rpc(name:WorkspaceRPC,args:Record<string,unknown>):Promise<unknown>;
 upload(bucket:WorkspaceBucket,path:string,bytes:Uint8Array,contentType:string):Promise<void>;
 download(bucket:WorkspaceBucket,path:string):Promise<Uint8Array>;
 remove(bucket:WorkspaceBucket,paths:string[]):Promise<void>;
}
