import { useEffect, useState } from "react";
import type { Activity, FormativeField } from "./default-activity";
import EditorImagePicker from "./EditorImagePicker";
import { templateRegistry } from "./template-registry";
import { apiRequest, forgetTeacherKey, getTeacherKey, getTeacherUsername, logoutTeacher, rememberTeacherKey } from "./gas-client";
import { activityCover, activityTheme } from "./activity-visual";
import templateIllustrations from "./assets/plantillas-ilustradas.webp";
import { coverWithField, fieldFromCover } from "./formative-field";
import "./activity-manager.css";
import PasswordField from "./PasswordField";

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

function previewUrl(activity: Activity) {
  const url = new URL(studentUrl(activity));
  url.searchParams.set("vista", "docente");
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

const crosswordIllustration = "data:image/webp;base64,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";

const illustrationCell: Record<string, number> = {
  "diagram-labels": 0, pairs: 1, quiz: 2, "quiz-show": 3, "true-false": 4,
  "group-sort": 5, sequence: 6, "complete-sentence": 7, "complete-phrase": 8,
  "word-order": 9, flashcards: 10, roulette: 11, memory: 12, "word-search": 13, crossword: 14,
};

function TemplateIllustration({ id }: { id: string }) {
  if (id === "crossword") return <span className="am-template-art-crop am-crossword-art"><img src={crosswordIllustration} alt="" /></span>;
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
  const [lifecycleOpenId, setLifecycleOpenId] = useState("");
  const [lifecycleMode, setLifecycleMode] = useState<"publish" | "schedule">("publish");

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

  async function saveLifecycle(activity: Activity, mode: "publish" | "schedule") {
    const selectedIds = assignmentDrafts[activity.id] ?? (Array.isArray(activity.assignedStudentIds) ? activity.assignedStudentIds : []);
    if (!selectedIds.length) { setNotice("Selecciona al menos un alumno para publicar la actividad."); return; }
    const values = availabilityValues[activity.id] ?? { from: localDateTime(activity.availableFrom), until: localDateTime(activity.availableUntil) };
    const availableFrom = mode === "publish" ? null : values.from ? new Date(values.from).toISOString() : null;
    const availableUntil = values.until ? new Date(values.until).toISOString() : null;
    if (mode === "schedule" && !availableFrom) { setNotice("Elige la fecha y hora en que se activará la actividad."); return; }
    if (availableFrom && new Date(availableFrom).getTime() <= Date.now()) { setNotice("Para programar, elige una fecha futura. Si quieres activarla ahora, usa Publicar."); return; }
    if (availableFrom && availableUntil && new Date(availableFrom) >= new Date(availableUntil)) { setNotice("La fecha de cierre debe ser posterior a la fecha de activación."); return; }
    setSavingAssignment(activity.id); setNotice("");
    try {
      const deadline = await apiRequest("/api/teacher/activity-deadline", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, availableFrom, availableUntil }) });
      const deadlineData = await deadline.json();
      if (!deadline.ok) throw new Error(deadlineData.error || "No se pudieron guardar las fechas.");
      const assigned = await apiRequest("/api/teacher/activity-students", { method: "POST", headers: { "x-teacher-key": key }, body: JSON.stringify({ id: activity.id, studentIds: selectedIds }) });
      const assignedData = await assigned.json();
      if (!assigned.ok) throw new Error(assignedData.error || "No se pudo asignar la actividad.");
      const updated = activities.map(item => item.id === activity.id ? { ...item, assignedStudentIds: selectedIds, availableFrom: deadlineData.availableFrom ?? null, availableUntil: deadlineData.availableUntil ?? null } : item);
      setActivities(updated);
      sessionStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), activities: updated, supportedKinds }));
      setLifecycleOpenId("");
      setNotice(mode === "publish" ? `Actividad publicada para ${selectedIds.length} alumno${selectedIds.length === 1 ? "" : "s"}.` : "Actividad programada y asignada. No aparecerá antes de la fecha elegida.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo publicar la actividad."); }
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

  function chooseCover(activityId: string, imageData: string, currentTheme: "mint" | "sky" | "lilac" | "peach" = "mint") {
    setDesignDrafts(old => ({ ...old, [activityId]: { theme: old[activityId]?.theme || currentTheme, imageData } }));
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
  if (!ready) return <main className="activity-manager-page"><header className="am-header"><a href="?panel=actividades">Aula en juego</a><span>Panel del maestro</span></header><form className="am-login" onSubmit={enter}><span className="am-kicker">ESPACIO DOCENTE</span><h1>Mis actividades</h1><p>Administra tus juegos y comparte el enlace con tus alumnos.</p><label>Nombre de usuario<input autoComplete="username" required value={draftCredentials.username} onChange={event => setDraftCredentials({ ...draftCredentials, username: event.target.value })}/></label><label>Contraseña<PasswordField autoComplete="current-password" required value={draftCredentials.password} onChange={event => setDraftCredentials({ ...draftCredentials, password: event.target.value })}/></label>{notice&&<p className="am-notice">{notice}</p>}<button className="am-primary" disabled={busy}>{busy?"Conectando…":"Entrar al panel"}</button><a href="./">Volver al inicio</a></form></main>;

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
        {!activities.length?<div className="am-empty">Todavía no hay actividades guardadas. Usa «Crear actividad» para elegir un juego.</div>:<div className="am-activity-grid">{activities.map(activity=>{const definition=templateRegistry.find(item=>item.id===(activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind));const preview=activityCover(activity);const assigned=assignmentDrafts[activity.id]??(Array.isArray(activity.assignedStudentIds)?activity.assignedStudentIds:[]);const isOpen=lifecycleOpenId===activity.id;const fieldName=formativeFields.find(field=>field.id===activity.fieldFormative)?.title||"Campo formativo sin asignar";return <article className={`am-activity-card am-library-card theme-${activityTheme(activity)}`} key={activity.id}>
          <div className="am-card-image">{preview?<img src={preview} alt={`Portada de ${activity.title}`} onError={event=>{event.currentTarget.hidden=true;event.currentTarget.parentElement?.classList.add("am-image-unavailable")}}/>:<TemplateIllustration id={activity.kind==="diagram"||!activity.kind?"diagram-labels":activity.kind}/>}</div>
          <div className="am-library-copy"><h3>{activity.title}</h3><p>{definition?.title||"Actividad"}</p><span className="am-library-field">{fieldName}</span></div>
          <div className="am-library-actions"><a className="am-preview-action" href={previewUrl(activity)} target="_blank" rel="noreferrer">Probar</a><button onClick={()=>{const close=lifecycleOpenId===activity.id&&lifecycleMode==="publish";setLifecycleMode("publish");setLifecycleOpenId(close?"":activity.id);}} aria-expanded={isOpen&&lifecycleMode==="publish"}>Publicar</button><button onClick={()=>{const close=lifecycleOpenId===activity.id&&lifecycleMode==="schedule";setLifecycleMode("schedule");setLifecycleOpenId(close?"":activity.id);}} aria-expanded={isOpen&&lifecycleMode==="schedule"}>Programar</button><a href={editorUrl(activity)}>Editar</a><button onClick={()=>void duplicate(activity)} disabled={busy}>Duplicar</button><a href={"?panel=resultados&actividad="+encodeURIComponent(activity.id)}>Reporte</a><button className="am-archive" onClick={()=>void archive(activity)} disabled={busy}>Eliminar</button></div>
          {isOpen&&<section className="am-publish-panel"><div><strong>{lifecycleMode==="publish"?"Publicar ahora":"Programar actividad"}</strong><button type="button" aria-label="Cerrar" onClick={()=>setLifecycleOpenId("")}>×</button></div><p>Elige quién podrá verla. La actividad seguirá como borrador hasta que confirmes aquí.</p>
            <div className="am-assignment-tools"><button type="button" onClick={()=>setAssignmentDrafts(old=>({...old,[activity.id]:students.filter(student=>student.active!==false).map(student=>String(student.id||""))}))}>Seleccionar todos</button><button type="button" onClick={()=>setAssignmentDrafts(old=>({...old,[activity.id]:[]}))}>Quitar selección</button><span>{assigned.length} seleccionados</span></div>
            <div className="am-assignment-list">{students.filter(student=>student.active!==false).map(student=>{const id=String(student.id||"");return <label key={id}><input type="checkbox" checked={assigned.includes(id)} onChange={event=>setAssignmentDrafts(old=>{const current=old[activity.id]??assigned;return {...old,[activity.id]:event.target.checked?[...current,id]:current.filter(value=>value!==id)}})}/><span>{String(student.given_names||"")} {String(student.paternal_surname||"")}</span></label>})}{!students.some(student=>student.active!==false)&&<p>Agrega alumnos activos desde «Mis alumnos» antes de publicar.</p>}</div>
            {lifecycleMode==="schedule"&&<div className="am-schedule-fields"><label>Se activa<input type="datetime-local" value={(availabilityValues[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).from} onChange={event=>setAvailabilityValues(old=>({...old,[activity.id]:{from:event.target.value,until:(old[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).until}}))}/></label><label>Finaliza (opcional)<input type="datetime-local" value={(availabilityValues[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).until} onChange={event=>setAvailabilityValues(old=>({...old,[activity.id]:{from:(old[activity.id]??{from:localDateTime(activity.availableFrom),until:localDateTime(activity.availableUntil)}).from,until:event.target.value}}))}/></label></div>}
            <button className="am-confirm-publish" onClick={()=>void saveLifecycle(activity,lifecycleMode)} disabled={savingAssignment===activity.id||!students.some(student=>student.active!==false)}>{savingAssignment===activity.id?"Guardando…":lifecycleMode==="publish"?"Publicar actividad":"Programar actividad"}</button>
          </section>}
        </article>})}</div>}
        <p className="am-footnote">Eliminar archiva la actividad de esta lista. Los resultados anteriores se conservan.</p>
      </section>
      </>}
    </section>
  </main>;
}
