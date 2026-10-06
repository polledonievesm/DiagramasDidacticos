import { useEffect, useState } from "react";
import type { Activity } from "./default-activity";
import { templateRegistry } from "./template-registry";
import { apiRequest, forgetTeacherKey, getTeacherKey, rememberTeacherKey } from "./gas-client";
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

type PanelCache = { savedAt: number; activities: Activity[]; supportedKinds: string[] };
type StudentRow = Record<string, unknown>;
const PANEL_CACHE_KEY = "activityManagerCacheV1";
const REPORT_CACHE_KEY = "activityManagerReportCacheV1";
const REPORT_CACHE_MS = 2 * 60 * 1000;

function readReportCache(): { savedAt: number; results: Record<string, unknown>[]; students: StudentRow[] } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(REPORT_CACHE_KEY) || "null") as { savedAt?: number; results?: Record<string, unknown>[]; students?: StudentRow[] } | null;
    if (!value || typeof value.savedAt !== "number" || !Array.isArray(value.results) || !Array.isArray(value.students)) return null;
    return {
      savedAt: value.savedAt,
      results: value.results as Record<string, unknown>[],
      students: value.students as StudentRow[],
    };
  } catch { return null; }
}

function readPanelCache(): PanelCache | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PANEL_CACHE_KEY) || "null") as PanelCache | null;
    if (!value || Date.now() - value.savedAt > 15 * 60 * 1000 || !Array.isArray(value.activities) || !Array.isArray(value.supportedKinds)) return null;
    return value;
  } catch { return null; }
}

function sameStudent(result: Record<string, unknown>, student: StudentRow) {
  if (result.student_id && student.id) return String(result.student_id) === String(student.id);
  const normalize = (value: unknown) => String(value || "").trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  return normalize(result.paternal_surname) === normalize(student.paternal_surname)
    && normalize(result.maternal_surname) === normalize(student.maternal_surname)
    && normalize(result.given_names) === normalize(student.given_names);
}

function isUnauthorized(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && Number((error as { status: unknown }).status) === 401;
}

export default function ActivityManager() {
  const query = new URLSearchParams(window.location.search);
  const view = query.get("panel") === "resultados" ? "results" : "activities";
  const section = query.get("seccion") === "crear" ? "create" : "home";
  const [initialCache] = useState(readPanelCache);
  const [initialReportCache] = useState(readReportCache);
  const [key, setKey] = useState(getTeacherKey);
  const [draftKey, setDraftKey] = useState("");
  const [activities, setActivities] = useState<Activity[]>(() => initialCache?.activities || []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(() => Boolean(getTeacherKey() && initialCache));
  const [copied, setCopied] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>(() => initialReportCache?.results || []);
  const [students, setStudents] = useState<StudentRow[]>(() => initialReportCache?.students || []);
  const [reportActivityId, setReportActivityId] = useState(query.get("actividad") || "");
  const [accountOpen, setAccountOpen] = useState(false);
  const [supportedKinds, setSupportedKinds] = useState<string[]>(() => initialCache?.supportedKinds || ["diagram","pairs"]);

  async function loadActivities(accessKey: string) {
    const headers = { "x-teacher-key": accessKey };
    const [activityResponse, capsResponse] = await Promise.all([
      apiRequest("/api/teacher/activities?tipo=all", { headers }),
      apiRequest("/api/capabilities"),
    ]);
    const [data, caps] = await Promise.all([activityResponse.json(), capsResponse.json()]);
    if (!activityResponse.ok || !Array.isArray(data)) {
      const error = new Error(data.error || "No se pudieron cargar tus actividades.") as Error & { status?: number };
      error.status = activityResponse.status;
      throw error;
    }
    const kinds = capsResponse.ok && Array.isArray(caps.kinds) ? caps.kinds : ["diagram","pairs"];
    const ordered = (data as Activity[]).sort((a, b) => a.title.localeCompare(b.title, "es-MX"));
    setActivities(ordered);
    setSupportedKinds(kinds);
    sessionStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), activities: ordered, supportedKinds: kinds }));
    setNotice("");
    setReady(true);
  }

  async function loadResults(accessKey: string) {
    const response = await apiRequest("/api/teacher/results", { headers: { "x-teacher-key": accessKey } });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) {
      const error = new Error(data.error || "No se pudieron cargar los resultados.") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    setResults(data);
    return data as Record<string, unknown>[];
  }

  async function loadStudents(accessKey: string) {
    const response = await apiRequest("/api/teacher/students", { headers: { "x-teacher-key": accessKey } });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) {
      const error = new Error(data.error || "No se pudo cargar la lista de alumnos.") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    setStudents(data);
    return data as StudentRow[];
  }

  async function loadReport(accessKey: string) {
    const [loadedResults, loadedStudents] = await Promise.all([loadResults(accessKey), loadStudents(accessKey)]);
    sessionStorage.setItem(REPORT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), results: loadedResults, students: loadedStudents }));
  }

  function handlePanelError(error: unknown) {
    setNotice(error instanceof Error ? error.message : "No se pudo conectar con el panel.");
    if (isUnauthorized(error)) {
      forgetTeacherKey();
      setKey("");
      setReady(false);
    }
  }

  useEffect(() => {
    if (!key) return;
    if (!ready) setBusy(true);
    void loadActivities(key).catch(handlePanelError).finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (key && view === "results") {
      const hasFreshReportCache = Boolean(initialReportCache && Date.now() - initialReportCache.savedAt < REPORT_CACHE_MS);
      if (!hasFreshReportCache) void loadReport(key).catch(handlePanelError);
    }
  }, [key, view]);

  function enter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("Conectando con tu hoja…");
    // Open the teacher panel immediately. A slow Sheets request must never send
    // the teacher back to the password form after a successful local sign-in.
    rememberTeacherKey(draftKey);
    setKey(draftKey);
    setReady(true);
    void loadActivities(draftKey).catch(handlePanelError).finally(() => setBusy(false));
  }

  async function refresh() {
    setBusy(true);
    try { await loadActivities(key); if (view === "results") await loadReport(key); }
    catch (error) { handlePanelError(error); }
    finally { setBusy(false); }
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

  if (!ready && key) return <main className="activity-manager-page"><header className="am-header"><a href="./">Aula en juego</a><span>Panel del maestro</span></header><section className="am-login"><span className="am-kicker">SESIÓN DOCENTE</span><h1>{notice ? "No se pudo cargar el panel" : "Cargando tus actividades…"}</h1><p>{notice || "Estamos conectando con tu hoja privada. No necesitas volver a escribir la clave."}</p>{notice&&<p className="am-notice" role="status">{notice}</p>}<button className="am-primary" disabled={busy} onClick={()=>{setBusy(true);setNotice("");void loadActivities(key).catch(handlePanelError).finally(()=>setBusy(false));}}>{busy?"Conectando…":"Reintentar"}</button><button className="am-secondary-button" onClick={()=>{forgetTeacherKey();setKey("");setDraftKey("");}}>Cerrar sesión</button></section></main>;
  if (!ready) return <main className="activity-manager-page"><header className="am-header"><a href="./">Aula en juego</a><span>Panel del maestro</span></header><form className="am-login" onSubmit={enter}><span className="am-kicker">ESPACIO DOCENTE</span><h1>Mis actividades</h1><p>Administra tus juegos y comparte el enlace con tus alumnos.</p><label>Clave del maestro<input autoComplete="current-password" type="password" required value={draftKey} onChange={event => setDraftKey(event.target.value)}/></label>{notice&&<p className="am-notice">{notice}</p>}<button className="am-primary" disabled={busy}>{busy?"Conectando…":"Entrar al panel"}</button><a href="./">Volver al inicio</a></form></main>;

  const available = templateRegistry.filter(template => template.status === "ready" && supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id));
  const planned = templateRegistry.filter(template => template.status !== "ready");

  return <main className="activity-manager-page">
    <header className="am-header"><a href="./"><span className="am-logo">A</span>Aula en juego</a><nav className="am-top-nav"><a className={view === "activities" ? "active" : ""} href="?panel=actividades">Mis actividades</a><a className={view === "results" ? "active" : ""} href="?panel=resultados">Mis resultados</a><a className={`am-nav-create ${section === "create" ? "active" : ""}`} href="?panel=actividades&seccion=crear">Crear actividad</a><div className="am-account"><button aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>Docente <span aria-hidden="true">⌄</span></button>{accountOpen&&<div className="am-account-menu"><strong>Sesión docente</strong><button onClick={()=>{forgetTeacherKey();setKey("");setReady(false);setDraftKey("");setAccountOpen(false);}}>Cerrar sesión</button></div>}</div></nav></header>
    <section className="am-main">
      {view === "results" ? <section className="am-list am-results-panel">
        <div className="am-list-heading"><div><span className="am-kicker">REGISTRO DEL GRUPO</span><h1>Mis resultados</h1><p>Consulta el avance de cada alumno por actividad.</p></div><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar resultados</button></div>
        <label className="am-report-select">Reporte de actividad<select value={reportActivityId} onChange={event=>{const value=event.target.value;setReportActivityId(value);const url=new URL(window.location.href);if(value)url.searchParams.set("actividad",value);else url.searchParams.delete("actividad");window.history.replaceState(null,"",url)}}><option value="">Todas las actividades · ver entregas</option>{activities.map(activity=><option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></label>
        {notice&&<p className="am-notice" role="status">{notice}</p>}
        {reportActivityId ? <div className="am-results-table-wrap"><table><thead><tr><th>Alumno</th><th>Aciertos</th><th>Calificación</th><th>Intentos</th><th>Mejor tiempo</th><th>Estado</th></tr></thead><tbody>{students.filter(student=>student.active!==false).slice().sort((a,b)=>String(a.paternal_surname||"").localeCompare(String(b.paternal_surname||""),"es-MX")||String(a.given_names||"").localeCompare(String(b.given_names||""),"es-MX")).map((student,index)=>{const attemptsForStudent=results.filter(row=>String(row.activity_id)===reportActivityId&&sameStudent(row,student));const best=attemptsForStudent.reduce<Record<string,unknown>|null>((current,candidate)=>{if(!current)return candidate;const currentRate=Number(current.correct||0)/Math.max(1,Number(current.total||0)),candidateRate=Number(candidate.correct||0)/Math.max(1,Number(candidate.total||0));return candidateRate>currentRate||(candidateRate===currentRate&&Number(candidate.elapsed_seconds??Infinity)<Number(current.elapsed_seconds??Infinity))?candidate:current},null);const fullName=[student.given_names,student.paternal_surname,student.maternal_surname].map(value=>String(value||"").trim()).filter(Boolean).join(" ");const duration=best?Math.max(0,Number(best.elapsed_seconds)||0):0;return <tr key={String(student.id||index)}><td>{fullName||"Alumno"}</td><td>{best?`${String(best.correct||0)} / ${String(best.total||0)}`:"—"}</td><td>{best?`${String(best.grade||0)} / 10`:"—"}</td><td>{attemptsForStudent.length}</td><td>{best?`${Math.floor(duration/60)}:${String(duration%60).padStart(2,"0")}`:"—"}</td><td><span className={best?"am-report-done":"am-report-pending"}>{best?"Realizada":"Pendiente"}</span></td></tr>})}</tbody></table>{students.filter(student=>student.active!==false).length===0&&<div className="am-empty">No hay cuentas activas de alumnos guardadas.</div>}</div> : !results.length?<div className="am-empty">Todavía no hay resultados registrados.</div>:<div className="am-results-table-wrap"><table><thead><tr><th>Alumno</th><th>Actividad</th><th>Aciertos</th><th>Calificación</th><th>Tiempo</th><th>Fecha</th></tr></thead><tbody>{results.map((row,index)=>{const activity=activities.find(item=>item.id===String(row.activity_id));const name=[row.given_names,row.paternal_surname].map(value=>String(value||"").trim()).filter(Boolean).join(" ");const duration=Math.max(0,Number(row.elapsed_seconds)||0);const submitted=row.submitted_at?new Date(String(row.submitted_at)).toLocaleString("es-MX"):"—";return <tr key={String(row.id||index)}><td>{name||"Alumno"}</td><td>{activity?.title||"Actividad"}</td><td>{String(row.correct||0)} / {String(row.total||0)}</td><td>{String(row.grade||0)} / 10</td><td>{Math.floor(duration/60)}:{String(duration%60).padStart(2,"0")}</td><td>{submitted}</td></tr>})}</tbody></table></div>}
      </section> : section === "create" ? <>
      <div className="am-heading"><div><span className="am-kicker">NUEVA ACTIVIDAD</span><h1>Elige una plantilla</h1><p>Al elegir un tipo de juego, se abrirá directamente su editor.</p></div><a className="am-back-link" href="?panel=actividades">← Mis actividades</a></div>
      {notice&&<p className="am-notice" role="status">{notice}</p>}
            <section className="am-create" id="crear"><div><h2>Crear actividad</h2><p>Al elegir una plantilla disponible, se abre su editor directamente.</p></div><div className="am-template-grid">{available.map(template=><a key={template.id} className="am-template-card" href={editorUrl(undefined,template.id)}><span>{template.id==="pairs"?"↔":"◎"}</span><b>{template.title}</b><small>{template.description}</small><strong>Crear actividad →</strong></a>)}</div>
      <details className="am-planned"><summary>Plantillas en preparación ({planned.length + templateRegistry.filter(template => template.status === "ready" && !supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id)).length})</summary><div>{[...planned,...templateRegistry.filter(template => template.status === "ready" && !supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id))].map(template=><span key={template.id}>{template.title}</span>)}</div></details></section>
      </> : <>
      <div className="am-heading"><div><span className="am-kicker">TU ESPACIO DE TRABAJO</span><h1>Mis actividades</h1><p>Abre, edita y comparte las actividades que has creado.</p></div><div className="am-heading-actions"><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar lista</button><a className="am-primary" href="?panel=actividades&seccion=crear">＋ Crear actividad</a></div></div>
      {notice&&<p className="am-notice" role="status">{notice}</p>}
            <section className="am-list"><div className="am-list-heading"><div><span className="am-kicker">GUARDADAS EN TU HOJA</span><h2>Actividades</h2></div><span>{activities.length} {activities.length===1?"actividad":"actividades"}</span></div>
        {!activities.length?<div className="am-empty">Todavía no hay actividades guardadas. Usa «Crear actividad» para elegir un juego.</div>:<div className="am-activity-grid">{activities.map(activity=>{const definition=templateRegistry.find(item=>item.id===(activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind));return <article className="am-activity-card" key={activity.id}><div className="am-card-top"><span>{definition?.title||"Actividad"}</span><button aria-label={"Compartir "+activity.title} onClick={()=>void share(activity)}>{copied===activity.id?"Enlace copiado ✓":"Compartir ↗"}</button></div><h3>{activity.title}</h3><p>{activity.kind==="pairs"||activity.kind==="memory"||activity.kind==="flashcards"?((activity.pairs||[]).length+(activity.kind==="memory"?" parejas":" tarjetas")):["quiz","quiz-show","true-false"].includes(activity.kind||"")?((activity.questions||[]).length+" preguntas"):activity.kind==="group-sort"?((activity.items||[]).length+" elementos"):activity.kind==="sequence"?((activity.steps||[]).length+" pasos"):(activity.kind==="complete-sentence"||activity.kind==="complete-phrase")?((activity.sentences||[]).length+" frases"):activity.kind==="word-order"?((activity.wordSentences||[]).length+" oraciones"):activity.kind==="roulette"?((activity.wheelEntries||[]).length+" retos"):activity.kind==="word-search"?((activity.wordSearchWords||[]).length+" palabras"):((activity.labels||[]).length+" etiquetas")}</p><div className="am-card-actions"><a href={editorUrl(activity)}>Editar</a><a href={"?panel=resultados&actividad="+encodeURIComponent(activity.id)}>Reporte</a><button onClick={()=>void duplicate(activity)} disabled={busy}>Duplicar</button>{activity.kind==="pairs"&&supportedKinds.includes("memory")&&<button onClick={()=>void convert(activity,"memory")} disabled={busy}>Crear como memorama</button>}{activity.kind==="pairs"&&supportedKinds.includes("flashcards")&&<button onClick={()=>void convert(activity,"flashcards")} disabled={busy}>Crear como tarjetas</button>}<button className="am-archive" onClick={()=>void archive(activity)} disabled={busy}>Eliminar</button></div></article>})}</div>}
        <p className="am-footnote">Eliminar archiva la actividad de esta lista. Los resultados anteriores se conservan.</p>
      </section>
      </>}
    </section>
  </main>;
}
