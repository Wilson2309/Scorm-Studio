import "server-only";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {hybridPreparedSchema,type HybridPrepared} from "../content/hybrid-schema";
import {WorkspaceError} from "./errors";
export function sha256(input:string|Uint8Array){return createHash("sha256").update(input).digest("hex");}
function key(){const value=process.env.WORKSPACE_SIGNING_KEY;if(!value||!/^[a-f0-9]{64}$/.test(value))throw new WorkspaceError(503,"signing_key_missing","La protección del espacio persistente requiere configuración del servidor.");return Buffer.from(value,"hex");}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));return value;}
function signature(owner:string,id:string,fileHash:string,payload:unknown){return createHmac("sha256",key()).update(JSON.stringify(canonical([1,owner,id,fileHash,payload]))).digest("hex");}
export function sealPrepared(owner:string,id:string,fileHash:string,prepared:HybridPrepared){
 const payload=hybridPreparedSchema.parse(prepared);return {version:1,payload,seal:signature(owner,id,fileHash,payload)};
}
export function openPrepared(owner:string,id:string,fileHash:string,input:unknown):HybridPrepared{
 key();
 try{
  const envelope=input as {version:unknown;payload:unknown;seal:unknown};
  if(envelope.version!==1||typeof envelope.seal!=="string"||!/^[a-f0-9]{64}$/.test(envelope.seal))throw new Error("invalid");
  const expected=Buffer.from(signature(owner,id,fileHash,envelope.payload),"hex"),received=Buffer.from(envelope.seal,"hex");
  if(!timingSafeEqual(expected,received))throw new Error("invalid");
  return hybridPreparedSchema.parse(envelope.payload);
 }catch{throw new WorkspaceError(422,"invalid_preparation","La preparación almacenada no corresponde a su fuente. Conserva el PDF y solicita revisar esta actividad.");}
}
