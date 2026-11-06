"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {z} from "zod";
import {ArrowLeft,ArrowRight,BookOpen,Eye,EyeOff} from "lucide-react";
import {Brand} from "@/components/layout/brand";
import {Button} from "@/components/ui/primitives";
import {AuthStory} from "./auth-story";
import styles from "./auth.module.css";
import {PageTransition} from "@/components/ui/page-transition";
import {browserSupabase} from "@/lib/supabase/browser";
import type {PublicSupabaseConfig} from "@/lib/supabase/config";
import {performAuth,AuthFlowError,type AuthMode} from "@/lib/auth/flow";
const copy={login:{title:<>Tu próxima idea<br/>empieza aquí.</>,intro:"Bienvenido a tu espacio creativo docente.",action:"Iniciar sesión",loading:"Entrando…"},register:{title:<>Un espacio<br/>para tus ideas.</>,intro:"Crea tu cuenta docente para comenzar.",action:"Crear cuenta",loading:"Creando tu cuenta…"},recover:{title:<>Recupera<br/>tu acceso.</>,intro:"Te enviaremos un enlace para elegir una nueva contraseña.",action:"Enviar enlace",loading:"Solicitando el enlace…"},reset:{title:<>Vuelve<br/>a tu espacio.</>,intro:"Elige una nueva contraseña para tu cuenta.",action:"Guardar contraseña",loading:"Guardando…"}};
export function LoginView({mode,config,origin,next,reason,notice}:{mode:AuthMode;config:PublicSupabaseConfig|null;origin:string|null;next:string;reason?:string;notice?:string}){
 const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [error,setError]=useState(""),[fields,setFields]=useState<Record<string,string>>({});const locked=useRef(false);
 const ready=!!config&&!!origin,hasPassword=mode!=="recover",isNew=mode==="register"||mode==="reset",text=copy[mode];
 const reasonText=reason==="invalid-link"?"Este enlace no es válido o ya fue utilizado. Solicita uno nuevo.":reason==="expired"?"Tu sesión o enlace expiró. Vuelve a identificarte.":reason==="profile-pending"?"No se pudo cargar tu perfil docente. Contacta con la administración para habilitarlo.":reason==="unavailable"?"El acceso no está disponible en este momento. Inténtalo más tarde.":"";
 async function submit(event:React.FormEvent<HTMLFormElement>){
   event.preventDefault();if(locked.current||!config||!origin)return;locked.current=true;setBusy(true);setError("");setFields({});setMessage("");
   const values=Object.fromEntries(new FormData(event.currentTarget));
   try{const result=await performAuth(mode,values,browserSupabase(config),origin,next);if(result.redirect){window.location.assign(result.redirect);return;}setMessage(result.notice??"");}
   catch(e){if(e instanceof z.ZodError){setFields(Object.fromEntries(e.issues.map(i=>[String(i.path[0]),i.message])));setError("Revisa los campos indicados.");}else setError(e instanceof AuthFlowError?e.message:"No se pudo completar la solicitud. Inténtalo nuevamente.");}
   finally{locked.current=false;setBusy(false);}
 }
 const errorBox=useRef<HTMLParagraphElement|null>(null);useEffect(()=>{if(error)errorBox.current?.focus();},[error]);
 const fieldError=(id:string)=>fields[id]?<small className="field-error" id={`${id}-error`}>{fields[id]}</small>:null;
 return <div className={`login-page ${styles.page}`}><AuthStory/>
 <main className="login-main"><PageTransition><div className="auth-nav"><Brand href="/inicio"/><Link className="auth-back" href="/inicio"><ArrowLeft size={15}/>Inicio</Link></div><h2>{text.title}</h2><p className="login-intro">{text.intro}</p>
 {!ready&&<p className="login-message" role="status">El acceso todavía no está disponible. La configuración del servicio está pendiente.</p>}
 {reasonText&&<p className="login-message" role="status">{reasonText}</p>}{notice==="password-updated"&&<p className="login-message" role="status">Contraseña actualizada. Inicia sesión con tu nueva contraseña.</p>}
 <form onSubmit={submit} aria-busy={busy}><fieldset className="auth-fields" disabled={busy||!ready}>
 {mode==="register"&&<div className="field"><label htmlFor="fullName">Tu nombre</label><input id="fullName" name="fullName" autoComplete="name" required maxLength={100} aria-invalid={!!fields.fullName} aria-describedby={fields.fullName?"fullName-error":undefined}/>{fieldError("fullName")}</div>}
 {mode!=="reset"&&<div className="field"><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" autoComplete="email" placeholder="tu.nombre@universidad.edu.ec" required maxLength={254} aria-invalid={!!fields.email} aria-describedby={fields.email?"email-error":undefined}/>{fieldError("email")}</div>}
 {hasPassword&&<div className="field"><label htmlFor="password">{isNew?"Nueva contraseña":"Contraseña"}</label><div className="password-field"><input id="password" name="password" type={visible?"text":"password"} autoComplete={isNew?"new-password":"current-password"} required minLength={isNew?8:1} maxLength={128} aria-invalid={!!fields.password} aria-describedby={fields.password?"password-error":isNew?"password-help":undefined}/><button type="button" aria-label={visible?"Ocultar contraseña":"Mostrar contraseña"} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{isNew&&<small id="password-help">Usa al menos 8 caracteres. Puedes pegar una contraseña de tu gestor.</small>}{fieldError("password")}</div>}
 {isNew&&<div className="field"><label htmlFor="confirmPassword">Confirma la contraseña</label><input id="confirmPassword" name="confirmPassword" type={visible?"text":"password"} autoComplete="new-password" required maxLength={128} aria-invalid={!!fields.confirmPassword} aria-describedby={fields.confirmPassword?"confirmPassword-error":undefined}/>{fieldError("confirmPassword")}</div>}
 <Button className="full-width" type="submit" disabled={busy||!ready}>{busy?text.loading:text.action}<ArrowRight size={17}/></Button></fieldset>
 {error&&<p className="field-error" role="alert" tabIndex={-1} ref={errorBox}>{error}</p>}{message&&<p className="login-message" role="status">{message}</p>}</form>
 <div className="auth-links">{mode==="login"?<><Link href="/recuperar">Olvidé mi contraseña</Link><Link href={`/registro?next=${encodeURIComponent(next)}`}>Crear una cuenta</Link></>:<Link href={`/login?next=${encodeURIComponent(next)}`}>Volver a iniciar sesión</Link>}</div>
 <p className="login-bottom"><BookOpen size={15}/>Hecho para enseñar. Diseñado para crear.</p></PageTransition></main></div>;
}
