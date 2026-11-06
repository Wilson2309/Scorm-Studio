import type {WorkspaceRPC} from "../workspace/port";
import type {AdminRPC} from "../admin/contracts";
export type Json=string|number|boolean|null|{[key:string]:Json|undefined}|Json[];
export type Role="TEACHER"|"ADMIN";
type PrivateRow={id:string;user_id:string;created_at:string;[key:string]:Json|undefined};
type PrivateTable={Row:PrivateRow;Insert:never;Update:never;Relationships:[]};
// RPC return values are untrusted JSON and parsed by workspace/contracts.ts.
// Direct domain writes are intentionally unavailable: transactional owner RPCs only.
export type Database={public:{Tables:{profiles:{Row:{id:string;full_name:string;role:Role;created_at:string;updated_at:string};Insert:{id:string;full_name?:string};Update:{full_name?:string};Relationships:[]};
 documents:PrivateTable;generations:PrivateTable;quiz_revisions:PrivateTable;quiz_drafts:PrivateTable;scorm_packages:PrivateTable;generation_events:PrivateTable;
};Views:Record<string,never>;Functions:{[K in WorkspaceRPC|AdminRPC]:{Args:Record<string,Json>;Returns:Json}};Enums:Record<string,never>;CompositeTypes:Record<string,never>}};
