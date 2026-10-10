import { useEffect, useState } from "react";
import { apiRequest, clearStudentSession, getStudentSession, saveStudentSession } from "./gas-client";
import type { ActivityKind } from "./default-activity";
import type { FormativeField } from "./default-activity";
import { fieldFromCover } from "./formative-field";
import "./student-portal.css";
import PasswordField from "./PasswordField";

type PortalActivity = { id:string; title:string; instructions?:string; kind:ActivityKind; imageUrl?:string; theme?:"mint"|"sky"|"lilac"|"peach"; fieldFormative?:FormativeField|""; availableFrom:string|null; dueAt:string|null; scheduled:boolean; expired:boolean; attempts:number; bestGrade:number|null; completed:boolean };
type PortalData = { student:{id:string;name:string;givenNames:string;paternalSurname:string;maternalSurname:string;username:string}; activities:PortalActivity[]; average:number|null; completedCount:number };
const studentFields: { id:FormativeField; title:string; icon:string }[] = [
  {id:"lenguajes",title:"Lenguajes",icon:"Aa"},
  {id:"saberes",title:"Saberes y pensamiento científico",icon:"∑"},
  {id:"etica",title:"Ética, naturaleza y sociedades",icon:"⌂"},
  {id:"humano",title:"De lo humano y lo comunitario",icon:"♡"},
];

function activityLink(activity:PortalActivity) {
  const url=new URL(window.location.href); url.search="";
  if(activity.kind==="pairs") url.searchParams.set("juego","parejas");
  else if(activity.kind!=="diagram") url.searchParams.set("juego",activity.kind);
  url.searchParams.set("actividad",activity.id);
  return url.toString();
}

function ActivityCard({item, state}:{item:PortalActivity;state:"pending"|"done"|"scheduled"|"expired"}) {
  const [imageFailed,setImageFailed]=useState(false);
  const status={pending:"Pendiente",done:"Realizada",scheduled:"Próximamente",expired:item.completed?"Cerrada · realizada":"Cerrada · pendiente"}[state];
  const startLabel=item.availableFrom?`${state==="scheduled"?"Se activa":"Abrió"} ${new Date(item.availableFrom).toLocaleString("es-MX")}`:"Disponible sin fecha de activación"; const endLabel=item.dueAt?`${state==="expired"?"Cerró":"Cierra"} ${new Date(item.dueAt).toLocaleString("es-MX")}`:"Sin fecha de cierre"; const deadline=`${startLabel} · ${endLabel}`;
  return <article className={`sp-card theme-${item.theme||"mint"} sp-card-${state}`}>
    <div className="sp-cover">
      {item.imageUrl&&!imageFailed&&<img src={item.imageUrl} alt={`Portada de ${item.title}`} loading="lazy" onError={()=>setImageFailed(true)}/>}
      {(!item.imageUrl||imageFailed)&&<span className="sp-cover-placeholder" aria-hidden="true">✦</span>}
    </div>
    <div className="sp-card-body">
      <div className="sp-card-meta"><span className={`sp-card-status sp-status-${state}`}>{status}</span><span className="sp-subject">{studentFields.find(field=>field.id===item.fieldFormative)?.title||"Sin campo asignado"}</span></div>
      <h3>{item.title}</h3>
      <p>{item.instructions||"Practica y revisa lo que has aprendido."}</p>
      {state==="done"&&<div className="sp-grade-note"><span>Tu mejor calificación</span><strong>{Number(item.bestGrade||0).toFixed(1)}<small> / 10</small></strong><small>{item.attempts} {item.attempts===1?"intento":"intentos"}</small></div>}
      {state==="expired"&&item.completed&&<div className="sp-grade-note"><span>Mejor calificación</span><strong>{Number(item.bestGrade||0).toFixed(1)}<small> / 10</small></strong></div>}
      <div className="sp-card-bottom"><small>{deadline}</small>{state==="pending"&&<a href={activityLink(item)}>Comenzar <span aria-hidden="true">→</span></a>}{state==="done"&&<a className="sp-secondary-link" href={activityLink(item)}>Volver a practicar</a>}</div>
    </div>
  </article>;
}

function LineIcon({name}:{name:"home"|"book"|"check"|"chart"|"calendar"|"logout"}) {
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  const paths={home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" {...common}/></>,book:<><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v18H7.5A3.5 3.5 0 0 0 4 23zM4 5.5v17.5M8 7h8M8 11h8" {...common}/></>,check:<><circle cx="12" cy="12" r="9" {...common}/><path d="m8 12 2.5 2.5L16 9" {...common}/></>,chart:<><path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z" {...common}/></>,calendar:<><rect x="3" y="5" width="18" height="16" rx="2" {...common}/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m3 0h2m-7 3h2" {...common}/></>,logout:<><path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" {...common}/></>};
  return <svg className="sp-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function StudentPortal() {
  const [session,setSession]=useState(getStudentSession);
  const [portal,setPortal]=useState<PortalData|null>(null);
  const [credentials,setCredentials]=useState({username:"",password:""});
  const [busy,setBusy]=useState(false);
  const [checkingSession,setCheckingSession]=useState(()=>Boolean(session?.token));
  const [notice,setNotice]=useState("");
  const [selectedField,setSelectedField]=useState(new URLSearchParams(window.location.search).get("campo")||"");

  async function load(token:string) {
    const response=await apiRequest("/api/student/portal?studentToken="+encodeURIComponent(token));
    const data=await response.json();
    if(!response.ok) {
      const error=Object.assign(new Error(data.error||"No se pudo abrir el portal del alumno."),{status:response.status});
      throw error;
    }
    // A pending Apps Script response must not restore a session after the
    // learner has signed out (or switched accounts in another tab).
    if(getStudentSession()?.token!==token) return;
    const enriched=data as PortalData;
    enriched.activities=enriched.activities.map(item=>({...item,fieldFormative:fieldFromCover(item.imageUrl)}));
    setPortal(enriched);
    saveStudentSession(token,(data as PortalData).student);
  }

  useEffect(()=>{
    if(!session?.token) { setCheckingSession(false); return; }
    let active=true;
    setCheckingSession(true); setNotice("");
    void load(session.token).catch(error=>{
      if(!active) return;
      const expired=typeof error==="object"&&error!==null&&"status" in error&&Number((error as {status:unknown}).status)===401;
      if(expired) { clearStudentSession(); setSession(null); }
      setNotice(error instanceof Error?error.message:"No se pudo abrir el portal del alumno.");
    }).finally(()=>{if(active)setCheckingSession(false);});
    return ()=>{active=false;};
  },[session?.token]);

  useEffect(()=>{
    const syncSession=()=>{
      const latest=getStudentSession();
      if(!latest?.token) { setSession(null); setPortal(null); setCheckingSession(false); setNotice("La sesión se cerró en otra pestaña."); return; }
      if(session?.token!==latest.token) { setPortal(null); setNotice(""); setCheckingSession(true); setSession(latest); }
    };
    window.addEventListener("storage",syncSession);
    return ()=>window.removeEventListener("storage",syncSession);
  },[]);

  async function signIn(event:React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const response=await apiRequest("/api/student/login",{method:"POST",body:JSON.stringify(credentials)});
      const data=await response.json();
      if(!response.ok||!data.token||!data.student) throw new Error(data.error||"Revisa el usuario y la contraseña de tu tarjeta.");
      saveStudentSession(String(data.token),data.student); setSession({token:String(data.token),student:data.student});
      setCredentials({username:"",password:""}); await load(String(data.token));
    } catch(error) { setNotice(error instanceof Error?error.message:"No se pudo iniciar sesión."); }
    finally { setBusy(false); }
  }

  function signOut() {
    clearStudentSession();
    // Return to the public role selector. Keeping ?panel=alumno here would
    // leave the learner on the student-only login screen after signing out.
    window.location.replace("?panel=inicio");
  }

  async function retrySession() {
    if(!session?.token) return;
    setCheckingSession(true); setNotice("");
    try { await load(session.token); }
    catch(error) {
      if(getStudentSession()?.token!==session.token) return;
      const expired=typeof error==="object"&&error!==null&&"status" in error&&Number((error as {status:unknown}).status)===401;
      if(expired) { clearStudentSession(); setSession(null); }
      setNotice(error instanceof Error?error.message:"No se pudo abrir el portal del alumno.");
    } finally { if(getStudentSession()?.token===session.token) setCheckingSession(false); }
  }

  if(!portal&&session?.token) return (
    <main className="student-portal sp-login-view">
      <header className="sp-login-header"><a className="sp-brand" href="./"><span className="sp-brand-mark">✦</span>Aula en juego</a><span>Espacio del alumno</span></header>
      <section className="sp-login" aria-live="polite">
        <span className="sp-kicker">SESIÓN DEL ALUMNO</span>
        <h1>{checkingSession?"Abriendo tus actividades":"Tu sesión sigue guardada"}</h1>
        <p>{checkingSession?"Estamos comprobando tu acceso.":notice||"No pudimos conectar con Apps Script. Conservamos tu sesión para que puedas volver a intentarlo."}</p>
        {notice&&!checkingSession&&<p className="sp-notice" role="alert">{notice}</p>}
        <button disabled={checkingSession} onClick={()=>void retrySession()}>{checkingSession?"Conectando…":"Reintentar conexión"}</button>
        <button type="button" className="sp-logout" onClick={signOut}>Cerrar sesión</button>
      </section>
    </main>
  );

  if(!portal) return (
    <main className="student-portal sp-login-view">
      <header className="sp-login-header"><a className="sp-brand" href="./"><span className="sp-brand-mark">✦</span>Aula en juego</a><span>Espacio del alumno</span></header>
      <form className="sp-login" onSubmit={signIn}>
        <span className="sp-kicker">ACCESO DEL ALUMNO</span><h1>Entra a tus actividades</h1>
        <p>Usa el usuario y la contraseña que te entregó tu maestro.</p>
        <label>Usuario<input autoComplete="username" value={credentials.username} onChange={event=>setCredentials({...credentials,username:event.target.value})} required/></label>
        <label>Contraseña<PasswordField autoComplete="current-password" value={credentials.password} onChange={event=>setCredentials({...credentials,password:event.target.value})} required/></label>
        {notice&&<p className="sp-notice">{notice}</p>}
        <button disabled={busy}>{busy?"Entrando…":"Ver mis actividades"}</button>
      </form>
    </main>
  );

  const visibleActivities=selectedField?portal.activities.filter(item=>selectedField==="sin-asignar"?!item.fieldFormative:item.fieldFormative===selectedField):portal.activities;
  const open=visibleActivities.filter(item=>!item.expired&&!item.scheduled),scheduled=visibleActivities.filter(item=>item.scheduled&&!item.expired),expired=visibleActivities.filter(item=>item.expired);
  const pending=open.filter(item=>!item.completed),completed=open.filter(item=>item.completed);
  const fieldAverage=(field:string)=>{const grades=portal.activities.filter(item=>(field==="sin-asignar"?!item.fieldFormative:item.fieldFormative===field)&&item.bestGrade!==null).map(item=>Number(item.bestGrade));return grades.length?grades.reduce((sum,value)=>sum+value,0)/grades.length:null;};
  function chooseField(field:string){setSelectedField(field);const url=new URL(window.location.href);if(field)url.searchParams.set("campo",field);else url.searchParams.delete("campo");window.history.replaceState(null,"",url);}
  const initials=(portal.student.givenNames||portal.student.name||"A").slice(0,1).toLocaleUpperCase("es-MX");
  return (
    <main className="student-portal sp-dashboard">
      <aside className="sp-sidebar">
        <a className="sp-brand" href="./"><span className="sp-brand-mark">✦</span><span>Aula<br/>en juego</span></a>
        <nav aria-label="Menú del alumno"><a className="active" href="#inicio"><LineIcon name="home"/>Inicio</a><a href="#pendientes"><LineIcon name="book"/>Mis actividades</a><a href="#realizadas"><LineIcon name="check"/>Realizadas</a><a href="#promedio"><LineIcon name="chart"/>Mi promedio</a></nav>
        <button className="sp-logout" onClick={signOut}><LineIcon name="logout"/>Cerrar sesión</button>
      </aside>
      <div className="sp-dashboard-content">
        <header className="sp-topbar"><span>Mi espacio de aprendizaje</span><div className="sp-profile"><span className="sp-avatar">{initials}</span><span><strong>{portal.student.givenNames} {portal.student.paternalSurname}</strong><small>Alumno</small></span><button onClick={signOut} aria-label="Cerrar sesión"><LineIcon name="logout"/></button></div></header>
        <section className="sp-main" id="inicio">
          <div className="sp-welcome"><div><span className="sp-kicker">TU ESPACIO DE APRENDIZAJE</span><h1>¡Hola, {portal.student.givenNames||portal.student.name}!</h1><p>Estas son tus actividades. Elige una para empezar.</p></div><div className="sp-welcome-art" aria-hidden="true"><span>✦</span><i/><i/><b/></div></div>
          <div className="sp-stats">
            <a className="sp-stat sp-stat-pending" href="#pendientes"><span className="sp-stat-icon"><LineIcon name="book"/></span><span>Por realizar<strong>{pending.length}</strong></span><span className="sp-stat-arrow">›</span></a>
            <a className="sp-stat sp-stat-done" href="#realizadas"><span className="sp-stat-icon"><LineIcon name="check"/></span><span>Realizadas<strong>{visibleActivities.filter(item=>item.completed).length}</strong></span><span className="sp-stat-arrow">›</span></a>
            <a className="sp-stat sp-stat-average" id="promedio" href="#realizadas"><span className="sp-stat-icon"><LineIcon name="chart"/></span><span>{selectedField?"Promedio del campo":"Mi promedio"}<strong>{(selectedField?fieldAverage(selectedField):portal.average)===null?"—":(selectedField?fieldAverage(selectedField):portal.average)!.toFixed(1)}<small>/10</small></strong></span><span className="sp-stat-arrow">›</span></a>
          </div>
          <section className="sp-field-section"><div className="sp-section-heading"><h2><LineIcon name="book"/>Campos formativos</h2>{selectedField&&<button onClick={()=>chooseField("")}>Ver todos los campos</button>}</div><div className="sp-field-grid">{studentFields.map(field=>{const count=portal.activities.filter(item=>item.fieldFormative===field.id).length;const avg=fieldAverage(field.id);return <button className={`sp-field-card ${selectedField===field.id?"selected":""}`} key={field.id} onClick={()=>chooseField(field.id)}><span>{field.icon}</span><strong>{field.title}</strong><small>{count} {count===1?"actividad":"actividades"} · {avg===null?"sin calificaciones":`promedio ${avg.toFixed(1)}/10`}</small></button>})}{(()=>{const count=portal.activities.filter(item=>!item.fieldFormative).length;const avg=fieldAverage("sin-asignar");return count?<button className={`sp-field-card ${selectedField==="sin-asignar"?"selected":""}`} key="sin-asignar" onClick={()=>chooseField("sin-asignar")}><span>＋</span><strong>Sin campo asignado</strong><small>{count} actividades · {avg===null?"sin calificaciones":`promedio ${avg.toFixed(1)}/10`}</small></button>:null})()}</div></section>
          <section className="sp-section" id="pendientes"><div className="sp-section-heading"><h2><LineIcon name="book"/>{selectedField?(studentFields.find(field=>field.id===selectedField)?.title||"Sin campo asignado"):"Por realizar"} <span>{pending.length}</span></h2><a href="#pendientes">Ver todas <b>›</b></a></div>
            {pending.length ? <div className="sp-grid">{pending.map(item=><ActivityCard item={item} state="pending" key={item.id}/>)}</div> : <p className="sp-empty">¡Muy bien! No tienes actividades pendientes.</p>}
          </section>
          {completed.length>0&&<section className="sp-section" id="realizadas"><div className="sp-section-heading"><h2><LineIcon name="check"/>Realizadas <span>{completed.length}</span></h2></div><div className="sp-grid sp-grid-done">{completed.map(item=><ActivityCard item={item} state="done" key={item.id}/>)}</div></section>}
          {scheduled.length>0&&<section className="sp-section"><div className="sp-section-heading"><h2><LineIcon name="calendar"/>Programadas <span>{scheduled.length}</span></h2></div><div className="sp-grid">{scheduled.map(item=><ActivityCard item={item} state="scheduled" key={item.id}/>)}</div></section>}
          {expired.length>0&&<section className="sp-section sp-expired"><div className="sp-section-heading"><h2><LineIcon name="calendar"/>Plazo terminado <span>{expired.length}</span></h2></div><div className="sp-grid">{expired.map(item=><ActivityCard item={item} state="expired" key={item.id}/>)}</div></section>}
        </section>
      </div>
    </main>
  );
}
