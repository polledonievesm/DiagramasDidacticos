import { useEffect, useState } from "react";
import type { Activity } from "./default-activity";
import { templateRegistry } from "./template-registry";
import { apiRequest } from "./gas-client";
import "./activity-manager.css";

function editorUrl(activity?: Activity, templateId = "diagram-labels", duplicate = false) {
  const url = new URL(window.location.href);
  url.search = "";
  const selected = activity?.kind || templateId;
  if (selected === "pairs") url.searchParams.set("juego", "parejas");
  else if (selected !== "diagram" && selected !== "diagram-labels") url.searchParams.set("juego", selected);
  url.searchParams.set("modo", "maestro");
  if (activity && !duplicate) url.searchParams.set("actividad", activity.id);
  if (duplicate) url.searchParams.set("duplicar", "1");
  if (!activity) { url.searchParams.set("plantilla", templateId); url.searchParams.set("nueva", "1"); }
  return url.toString();
}

function studentUrl(activity: Activity) {
  const url = new URL(window.location.href);
  url.search = "";
  if (activity.kind === "pairs") url.searchParams.set("juego", "parejas");
  else if (activity.kind && activity.kind !== "diagram") url.searchParams.set("juego", activity.kind);
  url.searchParams.set("actividad", activity.id);
  return url.toString();
}

export default function ActivityManager() {
  const [key, setKey] = useState(sessionStorage.getItem("platformTeacherKey") || "");
  const [draftKey, setDraftKey] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState("");

  async function loadActivities(accessKey: string) {
    const headers = { "x-teacher-key": accessKey };
    const [diagrams, pairs] = await Promise.all([
      apiRequest("/api/teacher/activities", { headers }),
      apiRequest("/api/teacher/activities?tipo=pairs", { headers }),
    ]);
    const [diagramData, pairData] = await Promise.all([diagrams.json(), pairs.json()]);
    if (!diagrams.ok || !Array.isArray(diagramData)) throw new Error(diagramData.error || "No se pudo validar la clave del maestro.");
    if (!pairs.ok || !Array.isArray(pairData)) throw new Error(pairData.error || "No se pudieron cargar las actividades de parejas.");
    setActivities([...pairData, ...diagramData].sort((a, b) => a.title.localeCompare(b.title, "es-MX")));
    setReady(true);
  }

  useEffect(() => {
    if (!key) return;
    void loadActivities(key).catch(() => {
      sessionStorage.removeItem("platformTeacherKey");
      setKey("");
    });
  }, []);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      await loadActivities(draftKey);
      setKey(draftKey);
      sessionStorage.setItem("platformTeacherKey", draftKey);
      sessionStorage.setItem("pairTeacherKey", draftKey);
      sessionStorage.setItem("diagramTeacherKey", draftKey);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo abrir el panel.");
    } finally { setBusy(false); }
  }

  async function refresh() {
    try { await loadActivities(key); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudieron actualizar las actividades."); }
  }

  async function duplicate(activity: Activity) {
    setBusy(true); setNotice("");
    try {
      const copy = { ...activity, id: "actividad-" + crypto.randomUUID(), title: activity.title + " (copia)" };
      const result = await apiRequest("/api/teacher/activity", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify(copy) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "No se pudo duplicar la actividad.");
      await refresh();
      setNotice("Copia creada. Ya puedes editarla.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo duplicar la actividad."); }
    finally { setBusy(false); }
  }

  async function archive(activity: Activity) {
    if (!window.confirm("¿Archivar “" + activity.title + "”? Sus resultados se conservarán en Sheets.")) return;
    setBusy(true); setNotice("");
    try {
      const result = await apiRequest("/api/teacher/activity-archive", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify({ id: activity.id }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "No se pudo archivar la actividad.");
      await refresh();
      setNotice("Actividad archivada. Sus resultados históricos se conservaron.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo archivar la actividad."); }
    finally { setBusy(false); }
  }

  async function share(activity: Activity) {
    const link = studentUrl(activity);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(activity.id);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      window.prompt("Copia el enlace para compartir esta actividad:", link);
    }
  }

  if (!ready) return <main className="activity-manager-page"><header className="am-header"><a href="./">Aula en juego</a><span>Panel del maestro</span></header><form className="am-login" onSubmit={enter}><span className="am-kicker">ESPACIO DOCENTE</span><h1>Mis actividades</h1><p>Administra tus juegos y comparte el enlace con tus alumnos.</p><label>Clave del maestro<input autoComplete="current-password" type="password" required value={draftKey} onChange={event => setDraftKey(event.target.value)}/></label>{notice&&<p className="am-notice">{notice}</p>}<button className="am-primary" disabled={busy}>{busy?"Conectando…":"Entrar al panel"}</button><a href="./">Volver al inicio</a></form></main>;

  const available = templateRegistry.filter(template => template.status === "ready");
  const planned = templateRegistry.filter(template => template.status !== "ready");

  return <main className="activity-manager-page">
    <header className="am-header"><a href="./"><span className="am-logo">A</span>Aula en juego</a><nav><span>Panel del maestro</span><button onClick={()=>{sessionStorage.removeItem("platformTeacherKey");sessionStorage.removeItem("pairTeacherKey");sessionStorage.removeItem("diagramTeacherKey");setKey("");setReady(false);setDraftKey("");}}>Salir</button></nav></header>
    <section className="am-main">
      <div className="am-heading"><div><span className="am-kicker">TU ESPACIO DE TRABAJO</span><h1>Mis actividades</h1><p>Crea, organiza y comparte actividades para tu grupo.</p></div><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar lista</button></div>
      {notice&&<p className="am-notice" role="status">{notice}</p>}
      <section className="am-create"><div><h2>Crear actividad</h2><p>Al elegir una plantilla disponible, se abre su editor directamente.</p></div><div className="am-template-grid">{available.map(template=><a key={template.id} className="am-template-card" href={editorUrl(undefined,template.id)}><span>{template.id==="pairs"?"↔":"◎"}</span><b>{template.title}</b><small>{template.description}</small><strong>Crear actividad →</strong></a>)}</div>
      <details className="am-planned"><summary>Plantillas en preparación ({planned.length})</summary><div>{planned.map(template=><span key={template.id}>{template.title}</span>)}</div></details></section>
      <section className="am-list"><div className="am-list-heading"><div><span className="am-kicker">GUARDADAS EN TU HOJA</span><h2>Actividades</h2></div><span>{activities.length} {activities.length===1?"actividad":"actividades"}</span></div>
        {!activities.length?<div className="am-empty">Todavía no hay actividades guardadas. Crea una con los botones de arriba.</div>:<div className="am-activity-grid">{activities.map(activity=>{const definition=templateRegistry.find(item=>item.id===(activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind));return <article className="am-activity-card" key={activity.id}><div className="am-card-top"><span>{definition?.title||"Actividad"}</span><button aria-label={"Compartir "+activity.title} onClick={()=>void share(activity)}>{copied===activity.id?"Enlace copiado ✓":"Compartir ↗"}</button></div><h3>{activity.title}</h3><p>{activity.kind==="pairs"?((activity.pairs||[]).length+" parejas"):activity.kind==="quiz"?((activity.questions||[]).length+" preguntas"):activity.kind==="group-sort"?((activity.items||[]).length+" elementos"):activity.kind==="sequence"?((activity.steps||[]).length+" pasos"):((activity.labels||[]).length+" etiquetas")}</p><div className="am-card-actions"><a href={editorUrl(activity)}>Editar</a><button onClick={()=>void duplicate(activity)} disabled={busy}>Duplicar</button><button className="am-archive" onClick={()=>void archive(activity)} disabled={busy}>Eliminar</button></div></article>})}</div>}
        <p className="am-footnote">Eliminar archiva la actividad de esta lista. Los resultados anteriores se conservan.</p>
      </section>
    </section>
  </main>;
}
