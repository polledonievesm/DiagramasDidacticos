import { useEffect, useState } from "react";
import type { Activity, FormativeField } from "./default-activity";
import { templateRegistry } from "./template-registry";
import { apiRequest, forgetTeacherKey, getTeacherKey, getTeacherUsername, logoutTeacher, rememberTeacherKey } from "./gas-client";
import { activityCover, activityTheme } from "./activity-visual";
import templateIllustrations from "./assets/plantillas-ilustradas.webp";
import { coverWithField, fieldFromCover } from "./formative-field";
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
const formativeFields: { id: FormativeField; title: string; description: string; icon: string }[] = [
  { id: "lenguajes", title: "Lenguajes", description: "Comunicación, lectura y expresión", icon: "Aa" },
  { id: "saberes", title: "Saberes y pensamiento científico", description: "Exploración, ciencia y matemáticas", icon: "∑" },
  { id: "etica", title: "Ética, naturaleza y sociedades", description: "Convivencia, historia y entorno", icon: "⌂" },
  { id: "humano", title: "De lo humano y lo comunitario", description: "Identidad, bienestar y comunidad", icon: "♡" },
];

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
function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function HeaderIcon({name}:{name:"activities"|"results"|"students"|"create"}) {
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  const shapes={activities:<><rect x="4" y="4" width="7" height="7" rx="1.5" {...common}/><rect x="13" y="4" width="7" height="7" rx="1.5" {...common}/><rect x="4" y="13" width="7" height="7" rx="1.5" {...common}/><rect x="13" y="13" width="7" height="7" rx="1.5" {...common}/></>,results:<><path d="M4 19V5m0 14h17" {...common}/><path d="m7 15 4-4 3 2 5-6" {...common}/></>,students:<><circle cx="9" cy="8" r="3" {...common}/><path d="M3 20v-1a6 6 0 0 1 12 0v1m2-9a3 3 0 1 0 0-6m1 9a5 5 0 0 1 3 5" {...common}/></>,create:<><path d="M12 5v14M5 12h14" {...common}/></>};
  return <svg className="am-nav-icon" viewBox="0 0 24 24" aria-hidden="true">{shapes[name]}</svg>;
}

const illustrationCell: Record<string, number> = {
  "diagram-labels": 0, pairs: 1, quiz: 2, "quiz-show": 3, "true-false": 4,
  "group-sort": 5, sequence: 6, "complete-sentence": 7, "complete-phrase": 8,
  "word-order": 9, flashcards: 10, roulette: 11, memory: 12, "word-search": 13, crossword: 14,
};

function TemplateIllustration({ id }: { id: string }) {
  const cell = illustrationCell[id] ?? 0;
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  const position = `${column * 100 / 3}% ${row * 100 / 3}%`;
  return <span className="am-template-art-crop" style={{ backgroundPosition: position, backgroundImage: `url(${templateIllustrations})` }} aria-hidden="true" />;
}

export default function ActivityManager() {
  const query = new URLSearchParams(window.location.search);
  const view = query.get("panel") === "resultados" ? "results" : "activities";
  const section = query.get("seccion") === "crear" ? "create" : "home";
  const [initialCache] = useState(readPanelCache);
  const [initialReportCache] = useState(readReportCache);
  const [key, setKey] = useState(getTeacherKey);
  const [draftCredentials, setDraftCredentials] = useState({ username: "", password: "" });
  const [activities, setActivities] = useState<Activity[]>(() => initialCache?.activities || []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(() => Boolean(getTeacherKey() && initialCache));
  const [copied, setCopied] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>(() => initialReportCache?.results || []);
  const [students, setStudents] = useState<StudentRow[]>(() => initialReportCache?.students || []);
  const [reportActivityId, setReportActivityId] = useState(query.get("actividad") || "");
  const [selectedField, setSelectedField] = useState(query.get("campo") || "");
  const [accountOpen, setAccountOpen] = useState(false);
  const [supportedKinds, setSupportedKinds] = useState<string[]>(() => initialCache?.supportedKinds || ["diagram","pairs"]);
  const [availabilityValues, setAvailabilityValues] = useState<Record<string, { from: string; until: string }>>({});
  const [savingDeadline, setSavingDeadline] = useState("");
  const [designDrafts, setDesignDrafts] = useState<Record<string, { theme: "mint" | "sky" | "lilac" | "peach"; imageData?: string }>>({});
  const [savingDesign, setSavingDesign] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string[]>>({});
  const [savingAssignment, setSavingAssignment] = useState("");

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
    const ordered = (data as Activity[]).map(activity => ({ ...activity, fieldFormative: activity.fieldFormative || fieldFromCover(activity.coverImageUrl) || null })).sort((a, b) => a.title.localeCompare(b.title, "es-MX"));
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
    if (key && view === "activities") void loadStudents(key).catch(() => {});
  }, [key, view]);

  useEffect(() => {
    if (key && view === "results") {
      const hasFreshReportCache = Boolean(initialReportCache && Date.now() - initialReportCache.savedAt < REPORT_CACHE_MS);
      if (!hasFreshReportCache) void loadReport(key).catch(handlePanelError);
    }
  }, [key, view]);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("Verificando el acceso docente…");
    try {
      const response = await apiRequest("/api/teacher/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draftCredentials) });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || "Usuario o contraseña incorrectos.");
      const accessToken = String(data.token);
      rememberTeacherKey(accessToken, String(data.username || draftCredentials.username));
      setKey(accessToken);
      setDraftCredentials({ username: "", password: "" });
      setReady(false);
      setNotice("Sesión iniciada. Cargando tus actividades…");
      await loadActivities(accessToken);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    } finally { setBusy(false); }
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

  async function saveDeadline(activity: Activity) {
    const values = availabilityValues[activity.id] ?? { from: localDateTime(activity.availableFrom), until: localDateTime(activity.availableUntil) };
    const availableFrom = values.from ? new Date(values.from).toISOString() : null;
    const availableUntil = values.until ? new Date(values.until).toISOString() : null;
    if (availableFrom && availableUntil && new Date(availableFrom) >= new Date(availableUntil)) {
      setNotice("La fecha de finalización debe ser posterior a la fecha de activación."); return;
    }
    setSavingDeadline(activity.id); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/activity-deadline", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, availableFrom, availableUntil }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la fecha límite.");
      const updated = activities.map(item => item.id === activity.id ? { ...item, availableFrom: data.availableFrom ?? null, availableUntil: data.availableUntil ?? null } : item);
      setActivities(updated);
      sessionStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), activities: updated, supportedKinds }));
      setAvailabilityValues(old => ({ ...old, [activity.id]: { from: localDateTime(data.availableFrom), until: localDateTime(data.availableUntil) } }));
      setNotice(availableFrom || availableUntil ? "Se guardó el periodo de disponibilidad." : "La actividad quedó sin fechas definidas.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo guardar el periodo de disponibilidad."); }
    finally { setSavingDeadline(""); }
  }

  async function saveAssignment(activity: Activity) {
    const selectedIds = assignmentDrafts[activity.id] ?? (Array.isArray(activity.assignedStudentIds) ? activity.assignedStudentIds : students.filter(student => student.active !== false).map(student => String(student.id || "")));
    setSavingAssignment(activity.id); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/activity-students", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, studentIds: selectedIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo asignar la actividad.");
      const updated = activities.map(item => item.id === activity.id ? { ...item, assignedStudentIds: selectedIds } : item);
      setActivities(updated);
      sessionStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), activities: updated, supportedKinds }));
      setNotice(selectedIds.length ? `Actividad activada para ${selectedIds.length} alumno${selectedIds.length === 1 ? "" : "s"}.` : "Actividad guardada como borrador; no se mostrará a los alumnos.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo guardar la asignación."); }
    finally { setSavingAssignment(""); }
  }

  async function saveFormativeField(activity: Activity, field: string) {
    setSavingDesign(activity.id); setNotice("");
    try {
      const cover = activity.coverImageUrl || activityCover(activity) || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      const response = await apiRequest("/api/teacher/activity-design", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, theme: activity.cardTheme || "mint", coverImageUrl: coverWithField(cover, field) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el campo formativo.");
      const markedCover = coverWithField(data.coverImageUrl || cover, field);
      if (markedCover !== (data.coverImageUrl || cover)) {
        const confirmSave = await apiRequest("/api/teacher/activity-design", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, theme: activity.cardTheme || "mint", coverImageUrl: markedCover }) });
        const confirmData = await confirmSave.json();
        if (!confirmSave.ok) throw new Error(confirmData.error || "No se pudo verificar el campo formativo.");
      }
      const updated = activities.map(item => item.id === activity.id ? { ...item, fieldFormative: field as FormativeField || null, coverImageUrl: markedCover } : item);
      setActivities(updated);
      sessionStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), activities: updated, supportedKinds }));
      setNotice("Se guardó el campo formativo de la actividad.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo guardar el campo formativo."); }
    finally { setSavingDesign(""); }
  }

  function chooseCover(activityId: string, file?: File, currentTheme: "mint" | "sky" | "lilac" | "peach" = "mint") {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setNotice("Elige una imagen PNG, JPG o WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { setNotice("La imagen debe pesar menos de 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setDesignDrafts(old => ({ ...old, [activityId]: { theme: old[activityId]?.theme || currentTheme, imageData: String(reader.result) } }));
    reader.readAsDataURL(file);
  }

  async function saveDesign(activity: Activity) {
    const draft = designDrafts[activity.id] || { theme: activityTheme(activity) };
    setSavingDesign(activity.id); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/activity-design", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, theme: draft.theme, imageData: draft.imageData || "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la imagen y el diseño.");
      const current = activities.find(item => item.id === activity.id);
      const currentField = current?.fieldFormative || fieldFromCover(current?.coverImageUrl);
      let coverImageUrl = data.coverImageUrl || current?.coverImageUrl || activity.imageUrl;
      if (currentField) {
        coverImageUrl = coverWithField(coverImageUrl, currentField);
        const tagged = await apiRequest("/api/teacher/activity-design", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, theme: data.cardTheme, coverImageUrl }) });
        const taggedData = await tagged.json();
        if (!tagged.ok) throw new Error(taggedData.error || "La imagen se guardó, pero no se conservó el campo formativo.");
      }
      const updated = activities.map(item => item.id === activity.id ? { ...item, coverImageUrl, fieldFormative: currentField || null, cardTheme: data.cardTheme } : item);
      setActivities(updated);
      sessionStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), activities: updated, supportedKinds }));
      setDesignDrafts(old => { const next = { ...old }; delete next[activity.id]; return next; });
      setNotice("Se guardó el diseño. La misma imagen aparecerá en el panel del maestro y en el del alumno.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo guardar el diseño."); }
    finally { setSavingDesign(""); }
  }

  if (!ready && key) return <main className="activity-manager-page"><header className="am-header"><a href="?panel=actividades">Aula en juego</a><span>Panel del maestro</span></header><section className="am-login"><span className="am-kicker">SESIÓN DOCENTE</span><h1>{notice ? "No se pudo cargar el panel" : "Cargando tus actividades…"}</h1><p>{notice || "Estamos conectando con tu hoja privada. Tu sesión permanece iniciada."}</p>{notice&&<p className="am-notice" role="status">{notice}</p>}<button className="am-primary" disabled={busy} onClick={()=>{setBusy(true);setNotice("");void loadActivities(key).catch(handlePanelError).finally(()=>setBusy(false));}}>{busy?"Conectando…":"Reintentar"}</button><button className="am-secondary-button" onClick={()=>{void logoutTeacher();setKey("");setDraftCredentials({username:"",password:""});}}>Cerrar sesión</button></section></main>;
  if (!ready) return <main className="activity-manager-page"><header className="am-header"><a href="?panel=actividades">Aula en juego</a><span>Panel del maestro</span></header><form className="am-login" onSubmit={enter}><span className="am-kicker">ESPACIO DOCENTE</span><h1>Mis actividades</h1><p>Administra tus juegos y comparte el enlace con tus alumnos.</p><label>Nombre de usuario<input autoComplete="username" required value={draftCredentials.username} onChange={event => setDraftCredentials({ ...draftCredentials, username: event.target.value })}/></label><label>Contraseña<input autoComplete="current-password" type="password" required value={draftCredentials.password} onChange={event => setDraftCredentials({ ...draftCredentials, password: event.target.value })}/></label>{notice&&<p className="am-notice">{notice}</p>}<button className="am-primary" disabled={busy}>{busy?"Conectando…":"Entrar al panel"}</button><a href="./">Volver al inicio</a></form></main>;

  const available = templateRegistry.filter(template => template.status === "ready" && supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id));
  const planned = templateRegistry.filter(template => template.status !== "ready");
  const selectedFormative = formativeFields.find(field => field.id === selectedField);
  const fieldActivities = activities.filter(activity => selectedField === "sin-asignar" ? !activity.fieldFormative : (activity.fieldFormative || "") === selectedField);
  const currentReport = activities.find(activity => activity.id === reportActivityId);
  useEffect(() => {
    if (view === "results" && reportActivityId && !selectedField && activities.length) {
      const report = activities.find(item => item.id === reportActivityId);
      if (report) setSelectedField(report.fieldFormative || "sin-asignar");
    }
  }, [activities, reportActivityId, selectedField, view]);
  function selectField(field: string) {
    setSelectedField(field); setReportActivityId("");
    const url = new URL(window.location.href);
    if (field) url.searchParams.set("campo", field); else url.searchParams.delete("campo");
    url.searchParams.delete("actividad"); window.history.replaceState(null, "", url);
  }
  function selectReport(activityId: string) {
    setReportActivityId(activityId);
    const url = new URL(window.location.href);
    if (activityId) url.searchParams.set("actividad", activityId); else url.searchParams.delete("actividad");
    window.history.replaceState(null, "", url);
  }
  function formativeSummary(field: string) {
    const ids = new Set(activities.filter(activity => activity.fieldFormative === field).map(activity => activity.id));
    const best = new Map<string, Record<string, unknown>>();
    results.filter(row => ids.has(String(row.activity_id))).forEach(row => {
      const person = String(row.student_id || [row.given_names,row.paternal_surname,row.maternal_surname].join("|")).toLocaleLowerCase("es-MX");
      const key = `${row.activity_id}|${person}`;
      const prior = best.get(key);
      if (!prior || Number(row.grade || 0) > Number(prior.grade || 0) || (Number(row.grade || 0) === Number(prior.grade || 0) && Number(row.correct || 0) > Number(prior.correct || 0))) best.set(key,row);
    });
    const values=[...best.values()].map(row=>Number(row.grade||0));
    return { average: values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null, grades: values.length };
  }

  return <main className="activity-manager-page">
    <header className="am-header"><a href="?panel=actividades"><span className="am-logo">A</span>Aula en juego</a><nav className="am-top-nav"><a className={view === "activities" ? "active" : ""} href="?panel=actividades"><HeaderIcon name="activities"/>Mis actividades</a><a className={view === "results" ? "active" : ""} href="?panel=resultados"><HeaderIcon name="results"/>Mis resultados</a><a href="?panel=alumnos&modo=maestro&tab=students"><HeaderIcon name="students"/>Mis alumnos</a><a className={`am-nav-create ${section === "create" ? "active" : ""}`} href="?panel=actividades&seccion=crear"><HeaderIcon name="create"/>Crear actividad</a><div className="am-account"><button aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>{getTeacherUsername()} <span aria-hidden="true">⌄</span></button>{accountOpen&&<div className="am-account-menu"><strong>Sesión docente</strong><button onClick={()=>{void logoutTeacher();setKey("");setReady(false);setDraftCredentials({username:"",password:""});setAccountOpen(false);}}>Cerrar sesión</button></div>}</div></nav></header>
    <section className="am-main">
      {view === "results" ? <section className="am-list am-results-panel">
        <div className="am-list-heading"><div><span className="am-kicker">REGISTRO DEL GRUPO</span><h1>Mis resultados</h1><p>Consulta el avance de cada alumno por actividad.</p></div><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar resultados</button></div>
        {!selectedField ? <><h2 className="am-field-prompt">Elige un campo formativo</h2><div className="am-field-grid">{formativeFields.map(field=>{const count=activities.filter(activity=>activity.fieldFormative===field.id).length;const summary=formativeSummary(field.id);return <button className="am-field-card" key={field.id} onClick={()=>selectField(field.id)}><span>{field.icon}</span><strong>{field.title}</strong><small>{field.description}</small><b>{count} {count===1?"actividad":"actividades"} · {summary.average===null?"sin calificaciones":`promedio ${summary.average.toFixed(1)}/10`}<i aria-hidden="true">→</i></b></button>})}<button className="am-field-card am-field-unassigned" onClick={()=>selectField("sin-asignar")}><span>＋</span><strong>Sin campo asignado</strong><small>Actividades pendientes de clasificar</small><b>{activities.filter(activity=>!activity.fieldFormative).length} actividades<i aria-hidden="true">→</i></b></button></div></> : <><div className="am-report-breadcrumb"><button onClick={()=>selectField("")}>← Campos formativos</button><div><span className="am-kicker">CAMPO FORMATIVO</span><h2>{selectedFormative?.title || "Sin campo asignado"}</h2><p>Elige una actividad para consultar resultados del grupo y de cada alumno.</p></div></div>{fieldActivities.length?<div className="am-report-activity-grid">{fieldActivities.map(activity=>{const definition=templateRegistry.find(item=>item.id===(activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind));const rows=results.filter(row=>String(row.activity_id)===activity.id);const unique=new Map<string,Record<string,unknown>>();rows.forEach(row=>{const k=String(row.student_id||[row.given_names,row.paternal_surname,row.maternal_surname].join("|")).toLocaleLowerCase("es-MX");const previous=unique.get(k);if(!previous||Number(row.grade||0)>Number(previous.grade||0))unique.set(k,row)});const avg=unique.size?[...unique.values()].reduce((sum,row)=>sum+Number(row.grade||0),0)/unique.size:null;return <button className={`am-report-activity theme-${activity.cardTheme||"mint"}`} key={activity.id} onClick={()=>selectReport(activity.id)}><span>{definition?.title||"Actividad"}</span><strong>{activity.title}</strong><small>{activity.availableFrom?`Se activa ${new Date(activity.availableFrom).toLocaleDateString("es-MX")}: `:""}{activity.availableUntil?`Cierra ${new Date(activity.availableUntil).toLocaleDateString("es-MX")}`:"Sin fecha de cierre"}</small><b>{avg===null?"Sin calificaciones":`Promedio del grupo ${avg.toFixed(1)} / 10`} · {unique.size} alumnos <i aria-hidden="true">→</i></b></button>})}</div>:<div className="am-empty">Todavía no hay actividades en este campo formativo.</div>}</>}
        {notice&&<p className="am-notice" role="status">{notice}</p>}
        {reportActivityId && currentReport ? <><div className="am-report-selected"><button onClick={()=>selectReport("")}>← Actividades de {selectedFormative?.title||"este campo"}</button><div><span className="am-kicker">REPORTE DE ACTIVIDAD</span><h2>{currentReport.title}</h2><p>El grupo se ordena por alumno. Se muestra su mejor calificación; intentos y mejor tiempo van aparte.</p></div></div><div className="am-results-table-wrap"><table><thead><tr><th>Alumno</th><th>Aciertos</th><th>Mejor calificación</th><th>Intentos</th><th>Mejor tiempo</th><th>Estado</th></tr></thead><tbody>{students.filter(student=>student.active!==false).slice().sort((a,b)=>String(a.paternal_surname||"").localeCompare(String(b.paternal_surname||""),"es-MX")||String(a.given_names||"").localeCompare(String(b.given_names||""),"es-MX")).map((student,index)=>{const attemptsForStudent=results.filter(row=>String(row.activity_id)===reportActivityId&&sameStudent(row,student));const best=attemptsForStudent.reduce<Record<string,unknown>|null>((current,candidate)=>{if(!current)return candidate;const currentRate=Number(current.correct||0)/Math.max(1,Number(current.total||0)),candidateRate=Number(candidate.correct||0)/Math.max(1,Number(candidate.total||0));return Number(candidate.grade||0)>Number(current.grade||0)||(Number(candidate.grade||0)===Number(current.grade||0)&&(candidateRate>currentRate||(candidateRate===currentRate&&Number(candidate.elapsed_seconds??Infinity)<Number(current.elapsed_seconds??Infinity))))?candidate:current},null);const fullName=[student.given_names,student.paternal_surname,student.maternal_surname].map(value=>String(value||"").trim()).filter(Boolean).join(" ");const duration=best?Math.max(0,Number(best.elapsed_seconds)||0):0;return <tr key={String(student.id||index)}><td>{fullName||"Alumno"}</td><td>{best?`${String(best.correct||0)} / ${String(best.total||0)}`:"—"}</td><td>{best?`${String(best.grade||0)} / 10`:"—"}</td><td>{attemptsForStudent.length}</td><td>{best?`${Math.floor(duration/60)}:${String(duration%60).padStart(2,"0")}`:"—"}</td><td><span className={best?"am-report-done":"am-report-pending"}>{best?"Realizada":"Pendiente"}</span></td></tr>})}</tbody></table>{students.filter(student=>student.active!==false).length===0&&<div className="am-empty">No hay cuentas activas de alumnos guardadas.</div>}</div></> : null}
      </section> : section === "create" ? <>
      <div className="am-heading"><div><span className="am-kicker">NUEVA ACTIVIDAD</span><h1>Elige una plantilla</h1><p>Al elegir un tipo de juego, se abrirá directamente su editor.</p></div><a className="am-back-link" href="?panel=actividades">← Mis actividades</a></div>
      {notice&&<p className="am-notice" role="status">{notice}</p>}
            <section className="am-create" id="crear"><div className="am-template-grid">{available.map(template=><a key={template.id} className="am-template-card" href={editorUrl(undefined,template.id)}><span className="am-template-symbol"><TemplateIllustration id={template.id}/></span><b>{template.title}</b><small>{template.description}</small></a>)}</div>
      <details className="am-planned"><summary>Plantillas en preparación ({planned.length + templateRegistry.filter(template => template.status === "ready" && !supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id)).length})</summary><div>{[...planned,...templateRegistry.filter(template => template.status === "ready" && !supportedKinds.includes(template.id === "diagram-labels" ? "diagram" : template.id))].map(template=><span key={template.id}>{template.title}</span>)}</div></details></section>
      </> : <>
      <div className="am-heading"><div><span className="am-kicker">TU ESPACIO DE TRABAJO</span><h1>Mis actividades</h1><p>Abre, edita y comparte las actividades que has creado.</p></div><div className="am-heading-actions"><button className="am-refresh" onClick={()=>void refresh()} disabled={busy}>Actualizar lista</button><a className="am-primary" href="?panel=actividades&seccion=crear">＋ Crear actividad</a></div></div>
      {notice&&<p className="am-notice" role="status">{notice}</p>}
            <section className="am-list"><div className="am-list-heading"><div><span className="am-kicker">GUARDADAS EN TU HOJA</span><h2>Actividades</h2><p>Configura cuándo deja de estar disponible cada actividad.</p></div><span>{activities.length} {activities.length===1?"actividad":"actividades"}</span></div>
        {!activities.length?<div className="am-empty">Todavía no hay actividades guardadas. Usa «Crear actividad» para elegir un juego.</div>:<div className="am-activity-grid">{activities.map(activity=>{const definition=templateRegistry.find(item=>item.id===(activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind));const design=designDrafts[activity.id]||{theme:activityTheme(activity)};const preview=design.imageData||activityCover(activity);const assigned=assignmentDrafts[activity.id]??(Array.isArray(activity.assignedStudentIds)?activity.assignedStudentIds:students.filter(student=>student.active!==false).map(student=>String(student.id||"")));return <article className={`am-activity-card theme-${design.theme}`} key={activity.id}><div className="am-card-image">{preview?<img src={preview} alt={`Portada de ${activity.title}`} onError={event=>{event.currentTarget.hidden=true;event.currentTarget.parentElement?.classList.add("am-image-unavailable")}} />:<span className="am-image-placeholder">Sube una portada</span>}</div><div className="am-card-top"><span>{definition?.title||"Actividad"}</span><button aria-label={"Compartir "+activity.title} onClick={()=>void share(activity)}>{copied===activity.id?"Enlace copiado ✓":"Compartir ↗"}</button></div><h3>{activity.title}</h3><p>{activity.kind==="pairs"||activity.kind==="memory"||activity.kind==="flashcards"?((activity.pairs||[]).length+(activity.kind==="memory"?" parejas":" tarjetas")):["quiz","quiz-show","true-false"].includes(activity.kind||"")?((activity.questions||[]).length+" preguntas"):activity.kind==="group-sort"?((activity.items||[]).length+" elementos"):activity.kind==="sequence"?((activity.steps||[]).length+" pasos"):(activity.kind==="complete-sentence"||activity.kind==="complete-phrase")?((activity.sentences||[]).length+" frases"):activity.kind==="word-order"?((activity.wordSentences||[]).length+" oraciones"):activity.kind==="roulette"?((activity.wheelEntries||[]).length+" retos"):activity.kind==="word-search"?((activity.wordSearchWords||[]).length+" palabras"):activity.kind==="crossword"?((activity.crosswordClues||[]).length+" pistas"):((activity.labels||[]).length+" etiquetas")}</p><label className="am-formative-select">Campo formativo<select aria-label={`Campo formativo de ${activity.title}`} value={activity.fieldFormative||""} onChange={event=>void saveFormativeField(activity,event.target.value)} disabled={savingDesign===activity.id}><option value="">Selecciona un campo formativo</option>{formativeFields.map(field=><option key={field.id} value={field.id}>{field.title}</option>)}</select><small>Se mostrará también en el panel del alumno y en resultados.</small></label><div className="am-design-controls"><label>Imagen que verá el alumno<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>chooseCover(activity.id,event.target.files?.[0],activityTheme(activity))}/><small>La misma imagen se muestra aquí y en el panel del alumno.</small></label><label>Color de la tarjeta<select value={design.theme} onChange={event=>setDesignDrafts(old=>({...old,[activity.id]:{...old[activity.id],theme:event.target.value as "mint"|"sky"|"lilac"|"peach"}}))}><option value="mint">Menta</option><option value="sky">Azul cielo</option><option value="lilac">Lavanda</option><option value="peach">Durazno</option></select></label><button onClick={()=>void saveDesign(activity)} disabled={savingDesign===activity.id}>{savingDesign===activity.id?"Guardando…":"Guardar diseño"}</button></div><div className="am-availability-status">{activity.availableFrom&&new Date(activity.availableFrom).getTime()>Date.now()?"Próximamente":activity.availableUntil&&new Date(activity.availableUntil).getTime()<=Date.now()?"Cerrada":activity.availableFrom||activity.availableUntil?"Activa por tiempo definido":"Activa · sin fecha definida"}</div><div className="am-deadline"><label>Se activa<input type="datetime-local" value={(availabilityValues[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).from} onChange={event=>setAvailabilityValues(old=>({...old,[activity.id]:{from:event.target.value,until:(old[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).until}}))}/></label><label>Finaliza<input type="datetime-local" value={(availabilityValues[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).until} onChange={event=>setAvailabilityValues(old=>({...old,[activity.id]:{from:(old[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).from,until:event.target.value}}))}/></label><button onClick={()=>void saveDeadline(activity)} disabled={savingDeadline===activity.id}>{savingDeadline===activity.id?"Guardando…":"Guardar periodo"}</button><small>{activity.availableFrom?`Activa ${new Date(activity.availableFrom).toLocaleString("es-MX")}`:"Activa de inmediato"} · {activity.availableUntil?`Finaliza ${new Date(activity.availableUntil).toLocaleString("es-MX")}`:"Sin fecha de cierre"}</small></div><details className="am-assignment"><summary>Asignar y activar para mis alumnos</summary><div className="am-assignment-tools"><button type="button" onClick={()=>setAssignmentDrafts(old=>({...old,[activity.id]:students.filter(student=>student.active!==false).map(student=>String(student.id||""))}))}>Seleccionar todos</button><button type="button" onClick={()=>setAssignmentDrafts(old=>({...old,[activity.id]:[]}))}>Quitar selección</button><span>{assigned.length} seleccionados</span></div><div className="am-assignment-list">{students.filter(student=>student.active!==false).map(student=>{const id=String(student.id||"");return <label key={id}><input type="checkbox" checked={assigned.includes(id)} onChange={event=>setAssignmentDrafts(old=>{const current=old[activity.id]??assigned;return {...old,[activity.id]:event.target.checked?[...current,id]:current.filter(value=>value!==id)}})}/><span>{String(student.given_names||"")} {String(student.paternal_surname||"")}</span></label>})}{!students.some(student=>student.active!==false)&&<p>Agrega alumnos activos desde «Mis alumnos» para poder asignar esta actividad.</p>}</div><button type="button" onClick={()=>void saveAssignment(activity)} disabled={savingAssignment===activity.id||students.length===0}>{savingAssignment===activity.id?"Guardando…":"Guardar y activar"}</button></details><div className="am-card-actions"><a href={editorUrl(activity)}>Editar</a><a href={"?panel=resultados&actividad="+encodeURIComponent(activity.id)}>Reporte</a><button onClick={()=>void duplicate(activity)} disabled={busy}>Duplicar</button>{activity.kind==="pairs"&&supportedKinds.includes("memory")&&<button onClick={()=>void convert(activity,"memory")} disabled={busy}>Crear como memorama</button>}{activity.kind==="pairs"&&supportedKinds.includes("flashcards")&&<button onClick={()=>void convert(activity,"flashcards")} disabled={busy}>Crear como tarjetas</button>}<button className="am-archive" onClick={()=>void archive(activity)} disabled={busy}>Eliminar</button></div></article>})}</div>}
        <p className="am-footnote">Eliminar archiva la actividad de esta lista. Los resultados anteriores se conservan.</p>
      </section>
      </>}
    </section>
  </main>;
}
