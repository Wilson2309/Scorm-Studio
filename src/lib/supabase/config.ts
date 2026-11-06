export type PublicSupabaseConfig={url:string;publishableKey:string};
/** Public configuration only. Never read a service-role/secret key here. */
export function publicSupabaseConfig(env:Record<string,string|undefined>=process.env):PublicSupabaseConfig|null {
  // Resolve on the server at request time. Only these two public values are
  // passed as props; never serialize process.env or bake test config into code.
  return validatePublicConfig(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function validatePublicConfig(urlValue?:string,keyValue?:string):PublicSupabaseConfig|null{
  const key=keyValue?.trim(),value=urlValue?.trim();if(!key||!value||key.startsWith("sb_secret_"))return null;
  try{
    const url=new URL(value);
    if(url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))return null;
    if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))return null;
    // Also refuse an accidentally supplied legacy service-role JWT.
    if(key.split(".").length===3){const payload=JSON.parse(atob(key.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));if(payload.role!=="anon")return null;}
    return {url:url.origin,publishableKey:key};
  }catch{return null;}
}
export function applicationURL(){
  try{const url=new URL(process.env.APP_URL??"http://localhost:3000");if(url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))return null;if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))return null;return url.origin;}catch{return null;}
}
