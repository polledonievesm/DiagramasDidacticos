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
  const view = new URLSearchParams(window.location.search).get("panel") === "resultados" ? "results" : "activities";
  const [key, setKey] = useState(sessionStorage.getItem("platformTeacherKey") || "");
  const [draftKey, setDraftKey] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [supportedKinds, setSupportedKinds] = useState<string[]>(["diagram","pairs"]);

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
    const capsResponse = await apiRequest("/api/capabilities");
    const caps = await capsResponse.json();
    setSupportedKinds(capsResponse.ok && Array.isArray(caps.kinds) ? caps.kinds : ["diagram","pairs"]);
    setReady(true);
  }

  async function loadResults(accessKey: string) {
    const response = await apiRequest("/api/teacher/results", { headers: { "x-teacher-key": accessKey } });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error(data.error || "No se pudieron cargar los resultados.");
    setResults(data);
  }

  useEffect(() => {
    if (!key) return;
    void loadActivities(key).catch(() => {
      sessionStorage.removeItem("platformTeacherKey");
      setKey("");
    });
  }, []);

  useEffect(() => {
    if (key && view === "results") void loadResults(key).catch(error => setNotice(error instanceof Error ? error.message : "No se pudieron cargar los resultados."));
  }, [key, view]);

  useEffect(() => {
    if (!ready || view !== "activities" || new URLSearchParams(window.location.search).get("seccion") !== "crear") return;
    window.requestAnimationFrame(() => document.getElementById("crear")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [ready, view]);

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
    try { await loadActivities(key); if (view === "results") await loadResults(key); }
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

  async function convert(activity: Activity, target: "memory" | "flashcards") {
    setBusy(true); setNotice("");
    try {
      const copy = { ...activity, id: "actividad-" + crypto.randomUUID(), kind: target, title: activity.title + (target === "memory" ? " (memorama)" : " (tarjetas)") };
      const result = await apiRequest("/api/teacher/activity", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify(copy) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "No se pudo crear la versión compatible.");
      await refresh(); setNotice("Se creó una copia como " + (target === "memory" ? "memorama." : "tarjetas.") + " El contenido original se conserva.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo convertir el contenido."); }
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

  const available = templateRegistry.filter(template => template.status === "ready" && supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id));
  const planned = templateRegistry.filter(template => template.status !== "ready");

  return <main className="activity-manager-page">
    <header className="am-header"><a href="./"><span className="am-logo">A</span>Aula en juego</a><nav className="am-top-nav"><a className={view === "activities" ? "active" : ""} href="?panel=actividades">Mis actividades</a><a className={view === "results" ? "active" : ""} href="?panel=resultados">Mis resultados</a><a className="am-nav-create" href="?panel=actividades&seccion=crear#crear">Crear actividad</a><div className="am-account"><button aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>Docente <span aria-hidden="true">⌄</span></button>{accountOpen&&<div className="am-account-menu"><strong>Sesión docente</strong><button onClick={()=>{sessionStorage.removeItem("platformTeacherKey");sessionStorage.removeItem("pairTeacherKey");sessionStorage.removeItem("diagramTeacherKey");setKey("");setReady(false);setDraftKey("");setAccountOpen(false);}}>Cerrar sesión</button></div>}</div></nav></header>
    <section className="am-main">
      {view === "results" ? <section className="am-list am-results-panel"><div className="am-list-heading"><div><span className="am-kicker">REGISTRO DEL GRUPO</span><h1>Mis resultados</h1><p>Resultados guardados en tu hoja privada.</p></div><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar resultados</button></div>{notice&&<p className="am-notice" role="status">{notice}</p>}{!results.length?<div className="am-empty">Todavía no hay resultados registrados.</div>:<div className="am-results-table-wrap"><table><thead><tr><th>Alumno</th><th>Actividad</th><th>Aciertos</th><th>Calificación</th><th>Tiempo</th><th>Fecha</th></tr></thead><tbody>{results.map((row,index)=>{const activity=activities.find(item=>item.id===String(row.activity_id));const name=[row.given_names,row.paternal_surname].map(value=>String(value||"").trim()).filter(Boolean).join(" ");const duration=Math.max(0,Number(row.elapsed_seconds)||0);const submitted=row.submitted_at?new Date(String(row.submitted_at)).toLocaleString("es-MX"):"—";return <tr key={String(row.id||index)}><td>{name||"Alumno"}</td><td>{activity?.title||"Actividad"}</td><td>{String(row.correct||0)} / {String(row.total||0)}</td><td>{String(row.grade||0)} / 10</td><td>{Math.floor(duration/60)}:{String(duration%60).padStart(2,"0")}</td><td>{submitted}</td></tr>})}</tbody></table></div>}</section> : <>
      <div className="am-heading"><div><span className="am-kicker">TU ESPACIO DE TRABAJO</span><h1>Mis actividades</h1><p>Crea, organiza y comparte actividades para tu grupo.</p></div><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar lista</button></div>
      {notice&&<p className="am-notice" role="status">{notice}</p>}
      <section className="am-create" id="crear"><div><h2>Crear actividad</h2><p>Al elegir una plantilla disponible, se abre su editor directamente.</p></div><div className="am-template-grid">{available.map(template=><a key={template.id} className="am-template-card" href={editorUrl(undefined,template.id)}><span>{template.id==="pairs"?"↔":"◎"}</span><b>{template.title}</b><small>{template.description}</small><strong>Crear actividad →</strong></a>)}</div>
      <details className="am-planned"><summary>Plantillas en preparación ({planned.length + templateRegistry.filter(template => template.status === "ready" && !supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id)).length})</summary><div>{[...planned,...templateRegistry.filter(template => template.status === "ready" && !supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id))].map(template=><span key={template.id}>{template.title}</span>)}</div></details></section>
      <section className="am-list"><div className="am-list-heading"><div><span className="am-kicker">GUARDADAS EN TU HOJA</span><h2>Actividades</h2></div><span>{activities.length} {activities.length===1?"actividad":"actividades"}</span></div>
        {!activities.length?<div className="am-empty">Todavía no hay actividades guardadas. Crea una con los botones de arriba.</div>:<div className="am-activity-grid">{activities.map(activity=>{const definition=templateRegistry.find(item=>item.id===(activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind));return <article className="am-activity-card" key={activity.id}><div className="am-card-top"><span>{definition?.title||"Actividad"}</span><button aria-label={"Compartir "+activity.title} onClick={()=>void share(activity)}>{copied===activity.id?"Enlace copiado ✓":"Compartir ↗"}</button></div><h3>{activity.title}</h3><p>{activity.kind==="pairs"||activity.kind==="memory"||activity.kind==="flashcards"?((activity.pairs||[]).length+(activity.kind==="memory"?" parejas":" tarjetas")):["quiz","quiz-show","true-false"].includes(activity.kind||"")?((activity.questions||[]).length+" preguntas"):activity.kind==="group-sort"?((activity.items||[]).length+" elementos"):activity.kind==="sequence"?((activity.steps||[]).length+" pasos"):(activity.kind==="complete-sentence"||activity.kind==="complete-phrase")?((activity.sentences||[]).length+" frases"):activity.kind==="word-order"?((activity.wordSentences||[]).length+" oraciones"):activity.kind==="roulette"?((activity.wheelEntries||[]).length+" retos"):activity.kind==="word-search"?((activity.wordSearchWords||[]).length+" palabras"):((activity.labels||[]).length+" etiquetas")}</p><div className="am-card-actions"><a href={editorUrl(activity)}>Editar</a><button onClick={()=>void duplicate(activity)} disabled={busy}>Duplicar</button>{activity.kind==="pairs"&&supportedKinds.includes("memory")&&<button onClick={()=>void convert(activity,"memory")} disabled={busy}>Crear como memorama</button>}{activity.kind==="pairs"&&supportedKinds.includes("flashcards")&&<button onClick={()=>void convert(activity,"flashcards")} disabled={busy}>Crear como tarjetas</button>}<button className="am-archive" onClick={()=>void archive(activity)} disabled={busy}>Eliminar</button></div></article>})}</div>}
        <p className="am-footnote">Eliminar archiva la actividad de esta lista. Los resultados anteriores se conservan.</p>
      </section>
      </>}
    </section>
  </main>;
}
