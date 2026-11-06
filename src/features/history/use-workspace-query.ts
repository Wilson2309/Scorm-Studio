"use client";
import {useEffect,useState} from "react";
import type {z} from "zod";
import {workspaceRequest} from "@/lib/workspace/client";
export function useWorkspaceQuery<T>(url:string,schema:z.ZodType<T>,revision=0){
 const key=`${url}:${revision}`;
 const [result,setResult]=useState<{key:string;data?:T;error?:string}|null>(null);
 useEffect(()=>{const controller=new AbortController();void workspaceRequest(url,{signal:controller.signal}).then(value=>{const data=schema.parse(value);if(!controller.signal.aborted)setResult({key,data});}).catch(error=>{if(!controller.signal.aborted)setResult({key,error:error instanceof Error?error.message:"No se pudo consultar tu trabajo."});});return()=>controller.abort();},[url,schema,key]);
 return result?.key===key?result:{key};
}
