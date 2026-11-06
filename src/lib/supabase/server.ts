import "server-only";
import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";
import {publicSupabaseConfig} from "./config";
import type {Database} from "./database.types";
export async function serverSupabase(writable=false){
  const store=await cookies();
  const config=publicSupabaseConfig();if(!config)return null;
  return createServerClient<Database>(config.url,config.publishableKey,{
    global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store",signal:init?.signal??AbortSignal.timeout(15000)})},
    cookies:{getAll:()=>store.getAll(),setAll(values){if(writable){for(const {name,value,options} of values)store.set(name,value,options);}/* Read-only RSC cookies are refreshed by Proxy. */}},
  });
}
