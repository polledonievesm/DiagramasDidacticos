import { useEffect, useState } from "react";
import { apiRequest, clearStudentSession, getStudentSession, saveStudentSession } from "./gas-client";
import type { ActivityKind } from "./default-activity";
import "./student-portal.css";

type PortalActivity = { id:string; title:string; kind:ActivityKind; availableFrom:string|null; dueAt:string|null; scheduled:boolean; expired:boolean; attempts:number; bestGrade:number|null; completed:boolean };
type PortalData = { student:{id:string;name:string;givenNames:string;paternalSurname:string;maternalSurname:string;username:string}; activities:PortalActivity[]; average:number|null; completedCount:number };

function activityLink(activity:PortalActivity) {
  const url=new URL(window.location.href); url.search="";
  if(activity.kind==="pairs") url.searchParams.set("juego","parejas");
  else if(activity.kind!=="diagram") url.searchParams.set("juego",activity.kind);
  url.searchParams.set("actividad",activity.id);
  return url.toString();
}

export default function StudentPortal() {
  const [session,setSession]=useState(getStudentSession);
  const [portal,setPortal]=useState<PortalData|null>(null);
  const [credentials,setCredentials]=useState({username:"",password:""});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");

  async function load(token:string) {
    const response=await apiRequest("/api/student/portal?studentToken="+encodeURIComponent(token));
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||"No se pudo abrir el portal del alumno.");
    setPortal(data as PortalData);
    saveStudentSession(token,(data as PortalData).student);
  }

  useEffect(()=>{if(session?.token) void load(session.token).catch(error=>{clearStudentSession();setSession(null);setNotice(error instanceof Error?error.message:"La sesión venció. Inicia sesión otra vez.");});},[]);

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

  function signOut() { clearStudentSession();setSession(null);setPortal(null);setNotice(""); }

  if(!portal) return (
    <main className="student-portal">
      <header className="sp-header"><a href="./">Aula en juego</a><span>Espacio del alumno</span></header>
      <form className="sp-login" onSubmit={signIn}>
        <span className="sp-kicker">ACCESO DEL ALUMNO</span><h1>Entra a tus actividades</h1>
        <p>Usa el usuario y la contraseña que te entregó tu maestro.</p>
        <label>Usuario<input autoComplete="username" value={credentials.username} onChange={event=>setCredentials({...credentials,username:event.target.value})} required/></label>
        <label>Contraseña<input type="password" autoComplete="current-password" value={credentials.password} onChange={event=>setCredentials({...credentials,password:event.target.value})} required/></label>
        {notice&&<p className="sp-notice">{notice}</p>}
        <button disabled={busy}>{busy?"Entrando…":"Ver mis actividades"}</button>
      </form>
    </main>
  );

  const open=portal.activities.filter(item=>!item.expired&&!item.scheduled),scheduled=portal.activities.filter(item=>item.scheduled&&!item.expired),expired=portal.activities.filter(item=>item.expired);
  return (
    <main className="student-portal">
      <header className="sp-header"><a href="./">Aula en juego</a><span>Espacio del alumno</span><button onClick={signOut}>Cerrar sesión</button></header>
      <section className="sp-main">
        <div className="sp-welcome">
          <div><span className="sp-kicker">MI APRENDIZAJE</span><h1>Hola, {portal.student.name} {portal.student.paternalSurname}</h1><p>Revisa tus actividades y continúa aprendiendo.</p></div>
          <div className="sp-average"><span>Promedio de actividades realizadas</span><strong>{portal.average===null?"—":portal.average.toFixed(1)}<small>/10</small></strong><small>{portal.completedCount} realizadas de {portal.activities.length}</small></div>
        </div>
        <section className="sp-section">
          <h2>Actividades disponibles <span>{open.length}</span></h2>
          {open.length ? <div className="sp-grid">{open.map(item => (
            <article className="sp-card" key={item.id}>
              <div className="sp-card-status">{item.completed ? "Realizada" : "Pendiente"}</div>
              <h3>{item.title}</h3>
              <p>{item.completed ? `Tu mejor calificación: ${Number(item.bestGrade).toFixed(1)} / 10 · ${item.attempts} ${item.attempts===1 ? "intento" : "intentos"}` : "Aún no la has realizado."}</p>
              <small>{item.dueAt ? `Finaliza ${new Date(item.dueAt).toLocaleString("es-MX")}` : "Sin fecha de cierre"}</small>
              <a href={activityLink(item)}>{item.completed ? "Volver a practicar" : "Comenzar actividad"} →</a>
            </article>
          ))}</div> : <p className="sp-empty">No tienes actividades disponibles por ahora.</p>}
        </section>
        {scheduled.length > 0 && <section className="sp-section">
          <h2>Actividades programadas <span>{scheduled.length}</span></h2>
          <div className="sp-grid">{scheduled.map(item => <article className="sp-card" key={item.id}><div className="sp-card-status sp-scheduled-status">Próximamente</div><h3>{item.title}</h3><p>Esta actividad todavía no está disponible.</p><small>Se activa {item.availableFrom ? new Date(item.availableFrom).toLocaleString("es-MX") : "pronto"}</small></article>)}</div>
        </section>}
        {expired.length > 0 && <section className="sp-section sp-expired">
          <h2>Plazo terminado <span>{expired.length}</span></h2>
          <div className="sp-grid">{expired.map(item => (
            <article className="sp-card" key={item.id}>
              <div className="sp-card-status">{item.completed ? "Cerrada · realizada" : "Cerrada · pendiente"}</div>
              <h3>{item.title}</h3>
              <p>{item.completed ? `Mejor calificación: ${Number(item.bestGrade).toFixed(1)} / 10 · ${item.attempts} intentos` : "No se registró una entrega antes del cierre."}</p>
              <small>Terminó {item.dueAt ? new Date(item.dueAt).toLocaleString("es-MX") : ""}</small>
            </article>
          ))}</div>
        </section>}
      </section>
    </main>
  );
}
