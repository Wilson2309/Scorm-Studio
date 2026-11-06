"use client";
import {createBrowserClient} from "@supabase/ssr";
import type {Database} from "./database.types";
import type {PublicSupabaseConfig} from "./config";
export function browserSupabase(config:PublicSupabaseConfig){return createBrowserClient<Database>(config.url,config.publishableKey);}
