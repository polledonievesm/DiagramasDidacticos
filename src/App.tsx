"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultActivity, type Activity, type DigestiveLabel } from "./default-activity";
import { apiRequest, clearStudentSession, getStudentSession, getTeacherKey, logoutTeacher, rememberTeacherKey, saveStudentSession, saveActivityAvailability } from "./gas-client";
import Catalog from "./Catalog";
import ActivitySettings from "./ActivitySettings";
import ActivityLeaderboard, { type LeaderboardRow } from "./ActivityLeaderboard";
import ActivityAnswerKey from "./ActivityAnswerKey";
import EditorContentHeader from "./EditorContentHeader";
import EditorImagePicker from "./EditorImagePicker";
import EditorItemActions from "./EditorItemActions";
import EditorWorkflow from "./EditorWorkflow";
import FocusBlurGuard from "./FocusBlurGuard";
import PasswordField from "./PasswordField";

type Screen = "catalog" | "intro" | "play" | "result" | "teacher";
type Result = { correct: number; total: number; grade: number; elapsedSeconds: number; remainingSeconds: number | null; timedOut: boolean; attemptsUsed: number; attemptsRemaining: number | null; maxAttempts: number | null };
type Leader = { rank: number; name: string; paternalSurname: string; grade: number; attempts: number };
type Attempt = { id: number; activity_id: string; student_id?: string; paternal_surname: string; maternal_surname: string; given_names: string; correct: number; total: number; grade: number; elapsed_seconds: number; remaining_seconds: number | null; timed_out: number; submitted_at: string };
type StudentAccount = { id: string; paternal_surname: string; maternal_surname: string; given_names: string; username: string; active: boolean; password_version?: string; password?: string };
type CredentialCard = { id?: string; paternalSurname: string; maternalSurname: string; givenNames: string; username: string; password: string };
const palette = ["#2789e8", "#d849cc", "#fa7a16", "#18884a", "#a739cc", "#ef563f", "#2548d8", "#13a783", "#d17b18", "#e52e45"];
const emptyStudent = { paternalSurname: "", maternalSurname: "", givenNames: "" };

function TeacherNavIcon({ name }: { name: "games" | "students" | "results" | "home" | "logout" }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shape = {
    games: <><rect x="4" y="4" width="7" height="7" rx="1.5" {...line}/><rect x="13" y="4" width="7" height="7" rx="1.5" {...line}/><rect x="4" y="13" width="7" height="7" rx="1.5" {...line}/><rect x="13" y="13" width="7" height="7" rx="1.5" {...line}/></>,
    students: <><circle cx="9" cy="8" r="3" {...line}/><path d="M3 20v-1a6 6 0 0 1 12 0v1m2-9a3 3 0 1 0 0-6m1 9a5 5 0 0 1 3 5" {...line}/></>,
    results: <><path d="M4 19V5m0 14h17" {...line}/><path d="m7 15 4-4 3 2 5-6" {...line}/></>,
    home: <><path d="m3 10 9-7 9 7" {...line}/><path d="M5 9v11h14V9M9 20v-6h6v6" {...line}/></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" {...line}/><path d="M13 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" {...line}/></>,
  }[name];
  return <svg className="teacher-nav-icon" viewBox="0 0 24 24" aria-hidden="true">{shape}</svg>;
}

function fmt(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function slug(value: string) { return value.toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "actividad"; }
function normalizeName(value: string) { return value.trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); }
function parseRoster(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const columns = line.includes("\t") ? line.split("\t") : line.split(";");
    if (columns.length < 3) return [];
    const [paternalSurname, maternalSurname, givenNames] = columns.map((part) => part.trim());
    if (/apellido|paterno/i.test(paternalSurname) && /apellido|materno/i.test(maternalSurname)) return [];
    return paternalSurname && maternalSurname && givenNames ? [{ paternalSurname, maternalSurname, givenNames }] : [];
  });
}
function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const cutoff = Math.floor(256 / alphabet.length) * alphabet.length;
  let password = "";
  while (password.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) if (byte < cutoff) password += alphabet[byte % alphabet.length];
  }
  return password.slice(0, 8);
}
function safeHtml(value: string) { return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch); }

export default function Home() {
  const previewMode = new URLSearchParams(window.location.search).get("vista") === "docente";
  const [activity, setActivity] = useState<Activity>(defaultActivity);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("catalog");
  const [student, setStudent] = useState(() => { const saved=getStudentSession()?.student; return saved ? { paternalSurname:saved.paternalSurname, maternalSurname:saved.maternalSurname, givenNames:saved.givenNames } : emptyStudent; });
  const [studentToken, setStudentToken] = useState(() => getStudentSession()?.token || "");
  const [studentCredentials, setStudentCredentials] = useState({ username: "", password: "" });
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [playLabels, setPlayLabels] = useState<DigestiveLabel[]>(defaultActivity.labels);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [teacherKey, setTeacherKey] = useState(() => getTeacherKey());
  const [teacherCredentials, setTeacherCredentials] = useState({ username: "", password: "" });
  // Reuse the saved browser session while validating it in the background.
  // This prevents a full-screen login/checking card on every teacher tab visit.
  const [teacherUnlocked, setTeacherUnlocked] = useState(() => Boolean(getTeacherKey()));
  const [teacherSessionState, setTeacherSessionState] = useState<"checking" | "signed-out" | "error" | "ready">(() => getTeacherKey() ? "checking" : "signed-out");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [editing, setEditing] = useState<Activity>(defaultActivity);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [modeTab, setModeTab] = useState<"edit" | "results" | "students">(() => new URLSearchParams(window.location.search).get("tab") === "students" ? "students" : "edit");
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [rosterDraft, setRosterDraft] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"all"|"active"|"inactive">("all");
  const audioRef = useRef<AudioContext | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const submitRef = useRef<(timedOut: boolean, elapsed: number) => void>(() => {});

  const sound = useCallback((kind: "stretch" | "snap" | "return" | "finish" | "timeout") => {
    if (muted || typeof window === "undefined") return;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = audioRef.current || (audioRef.current = new AudioCtor());
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      const play = (freq: number, end: number, delay: number, length: number, type: OscillatorType = "sine", volume = 0.055) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, now + delay); osc.frequency.exponentialRampToValueAtTime(Math.max(45, end), now + delay + length);
        gain.gain.setValueAtTime(0.001, now + delay); gain.gain.linearRampToValueAtTime(volume, now + delay + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, now + delay + length + 0.09);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + delay); osc.stop(now + delay + length + 0.1);
      };
      if (kind === "stretch") play(190, 380, 0, 0.12, "triangle", 0.035);
      if (kind === "snap") { play(510, 205, 0, 0.16, "sine", 0.07); play(270, 130, 0.045, 0.12, "triangle", 0.035); }
      if (kind === "return") play(300, 160, 0, 0.2, "triangle", 0.045);
      if (kind === "finish") { play(523, 523, 0, 0.22, "sine", 0.06); play(659, 659, 0.15, 0.22, "sine", 0.06); play(784, 784, 0.3, 0.38, "sine", 0.07); }
      if (kind === "timeout") { play(440, 390, 0, 0.17, "triangle", 0.055); play(330, 285, 0.18, 0.27, "triangle", 0.055); }
    } catch { /* El audio no debe impedir que se juegue. */ }
  }, [muted]);

  const loadActivity = useCallback(async (id: string) => {
    try {
      const response = await apiRequest(`/api/activity?id=${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("No se encontró la actividad.");
      const data = await response.json() as Activity;
      setActivity(data); setEditing(data); setPlacements({}); setNotice("");
      if (previewMode) { setLeaderboard([]); setActivityLoaded(true); return; }
      const ranking = await apiRequest(`/api/leaderboard?activityId=${encodeURIComponent(id)}`);
      if (ranking.ok) setLeaderboard(await ranking.json() as Leader[]);
      setActivityLoaded(true);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo cargar la actividad."); }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("modo") === "maestro" || query.get("panel") === "alumnos") { setScreen("teacher"); if (query.get("panel") === "alumnos" || query.get("tab") === "students") setModeTab("students"); const savedKey = getTeacherKey(); if (savedKey) void unlockTeacher(savedKey); return; }
    const activityId = query.get("actividad");
    if (!activityId) { setScreen("catalog"); return; }
    setScreen("intro");
    void loadActivity(activityId);
  }, [loadActivity]);

  useEffect(() => {
    if (previewMode && activityLoaded && screen === "intro") void startGame();
  }, [previewMode, activityLoaded, screen]);

  useEffect(() => { if (teacherUnlocked && modeTab === "students") void loadStudents(); }, [teacherUnlocked, modeTab]);

  useEffect(() => {
    if (screen !== "play" || activity.timerMode === "none") return;
    const timer = window.setInterval(() => setSeconds((old) => {
      const next = old + 1;
      if (activity.timerMode === "down" && next >= activity.timeLimitSeconds) {
        window.clearInterval(timer); window.setTimeout(() => submitRef.current(true, next), 0); return activity.timeLimitSeconds;
      }
      return next;
    }), 1000);
    return () => window.clearInterval(timer);
  // submit uses the current state and the interval is restarted only for a new play.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const remaining = activity.timerMode === "down" ? Math.max(0, activity.timeLimitSeconds - seconds) : null;
  const clockText = activity.timerMode === "down" ? fmt(remaining ?? 0) : fmt(seconds);
  submitRef.current = (timedOut, elapsed) => { void submit(timedOut, elapsed); };

  useEffect(() => {
    const measure = () => {
      if (!boardRef.current || !stageRef.current) return;
      const br = boardRef.current.getBoundingClientRect(); const sr = stageRef.current.getBoundingClientRect();
      const next = activity.labels.flatMap((label) => {
        if (!placements[label.id]) return [];
        const chip = chipsRef.current[label.id]; if (!chip) return [];
        const destination = activity.labels.find((item) => item.id === placements[label.id]);
        if (!destination) return [];
        const cr = chip.getBoundingClientRect();
        return [{ id: label.id, x1: cr.left + cr.width / 2 - br.left, y1: cr.top + cr.height / 2 - br.top, x2: sr.left + sr.width * destination.x / 100 - br.left, y2: sr.top + sr.height * destination.y / 100 - br.top, color: label.color }];
      });
      setLines(next);
    };
    measure(); window.addEventListener("resize", measure); const t = window.setTimeout(measure, 150);
    return () => { window.removeEventListener("resize", measure); window.clearTimeout(t); };
  }, [placements, activity.labels, screen]);

  async function submit(timedOut = false, elapsedOverride?: number) {
    if (busy || screen === "result") return;
    setBusy(true); setNotice("");
    const elapsed = elapsedOverride ?? seconds;
    try {
      if (previewMode) {
        const correct = Object.entries(placements).filter(([labelId, targetId]) => labelId === targetId).length;
        setResult({ correct, total: activity.labels.length, grade: activity.labels.length ? Math.round(correct / activity.labels.length * 100) / 10 : 0, elapsedSeconds: elapsed, remainingSeconds: activity.timerMode === "down" ? Math.max(0, activity.timeLimitSeconds - elapsed) : null, timedOut, attemptsUsed: 0, attemptsRemaining: null, maxAttempts: null });
        setScreen("result"); sound(timedOut ? "timeout" : "finish"); return;
      }
      const response = await apiRequest("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: activity.id, ...student, studentToken, placements, elapsedSeconds: elapsed, remainingSeconds: activity.timerMode === "down" ? Math.max(0, activity.timeLimitSeconds - elapsed) : null, timedOut }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar el resultado.");
      setResult(data); setScreen("result"); sound(timedOut ? "timeout" : "finish");
      if (activity.showLeaderboard) void apiRequest(`/api/leaderboard?activityId=${encodeURIComponent(activity.id)}`)
        .then(async ranking => { if (ranking.ok) setLeaderboard(await ranking.json() as Leader[]); })
        .catch(() => {});
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo guardar el resultado."); }
    finally { setBusy(false); }
  }

  async function startGame(profile = student, token = studentToken) {
    if (!previewMode && (!token || !profile.paternalSurname.trim() || !profile.maternalSurname.trim() || !profile.givenNames.trim())) { setNotice("Inicia sesión con tu usuario y contraseña para comenzar."); return; }
    if (!previewMode) { setBusy(true); setNotice("");
      try { const params = new URLSearchParams({ activityId: activity.id, ...profile, studentToken: token }); const response = await apiRequest(`/api/attempts?${params}`); const availability = await response.json(); if (!response.ok) throw new Error(availability.error || "No se pudieron revisar tus intentos."); if (!availability.canStart) throw new Error("Ya utilizaste todos tus intentos para esta actividad."); } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo revisar tus intentos."); setBusy(false); return; }
      setBusy(false);
    }
    const shuffled = [...activity.labels];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setPlayLabels(shuffled);
    setPlacements({}); setSeconds(0); setResult(null); setNotice(""); setScreen("play");
  }

  async function loginStudent() {
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/student/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studentCredentials) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      const profile = data.student as { paternalSurname: string; maternalSurname: string; givenNames: string };
      const token = String(data.token || "");
      if (!profile || !token) throw new Error("No se pudo validar la cuenta. Revisa usuario y contraseña.");
      setStudent(profile); setStudentToken(token); saveStudentSession(token,{...profile,id:String(data.student.id),username:String(data.student.username)}); setStudentCredentials({ username: "", password: "" }); setBusy(false);
      await startGame(profile, token);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Usuario o contraseña incorrectos."); setBusy(false); }
  }

  function retryGame() {
    if (!result || (result.attemptsRemaining !== null && result.attemptsRemaining <= 0)) return;
    const shuffled = [...activity.labels];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    setPlayLabels(shuffled); setPlacements({}); setSeconds(0); setResult(null); setNotice(""); setSelected(null); setScreen("play");
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, label: DigestiveLabel) {
    if (screen === "result") return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(label.id); setDrag({ id: label.id, x: event.clientX, y: event.clientY }); sound("stretch");
  }
  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) { if (drag) setDrag({ ...drag, x: event.clientX, y: event.clientY }); }
  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag || drag.id === "__admin__" || !stageRef.current) { setDrag(null); return; }
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100; const y = ((event.clientY - rect.top) / rect.height) * 100;
    const nearest = activity.labels.map((label) => ({ label, distance: Math.hypot((x - label.x) * rect.width / 100, (y - label.y) * rect.height / 100) })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < Math.max(32, rect.width * 0.075)) {
      const occupied = Object.entries(placements).some(([labelId, targetId]) => labelId !== drag.id && targetId === nearest.label.id);
      if (occupied) { setNotice("Ese punto ya tiene una etiqueta. Elige otro."); sound("return"); }
      else { setPlacements((p) => ({ ...p, [drag.id]: nearest.label.id })); setNotice(""); sound("snap"); }
    } else { setPlacements((p) => { const n = { ...p }; delete n[drag.id]; return n; }); sound("return"); }
    setDrag(null);
  }

  async function unlockTeacher(accessKey = teacherKey) {
    setNotice("");
    setTeacherSessionState("checking");
    const headers = { "x-teacher-key": accessKey };
    try {
      const response = await apiRequest("/api/teacher/activities", { headers }); const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "No se pudo verificar el acceso.") as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      const diagramActivities = (data as Activity[]).filter((item) => !item.kind || item.kind === "diagram");
      setTeacherKey(accessKey); rememberTeacherKey(accessKey); setTeacherUnlocked(true); setTeacherSessionState("ready"); setActivities(diagramActivities);
      const query = new URLSearchParams(window.location.search);
      if (query.get("nueva") === "1") addNewActivity();
      else { const selectedId = query.get("actividad"); setEditing(diagramActivities.find((a) => a.id === (selectedId || activity.id)) || activity); }
      await loadResults(accessKey);
    } catch (e) {
      const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : 0;
      setNotice(e instanceof Error ? e.message : "No se pudo verificar la sesión.");
      setTeacherSessionState("error");
      if (status === 401) {
        void logoutTeacher();
        setTeacherKey("");
        setTeacherUnlocked(false);
        setTeacherSessionState("signed-out");
      }
    }
  }
  async function teacherSignIn() {
    setBusy(true); setNotice("");
    setTeacherSessionState("checking");
    try {
      const response = await apiRequest("/api/teacher/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(teacherCredentials) });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || "Usuario o contraseña incorrectos.");
      rememberTeacherKey(String(data.token), String(data.username || teacherCredentials.username));
      setTeacherCredentials({ username: "", password: "" });
      await unlockTeacher(String(data.token));
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo iniciar sesión."); setTeacherSessionState("signed-out"); }
    finally { setBusy(false); }
  }
  async function loadResults(key = teacherKey) {
    try { const response = await apiRequest("/api/teacher/results", { headers: { "x-teacher-key": key } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setAttempts(data); }
    catch (e) { setNotice(e instanceof Error ? e.message : "No se pudieron cargar los resultados."); }
  }
  async function loadStudents(key = teacherKey) {
    try { const response = await apiRequest("/api/teacher/students", { headers: { "x-teacher-key": key } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar las cuentas."); setStudents(data as StudentAccount[]); }
    catch (e) { setNotice(e instanceof Error ? e.message : "No se pudieron cargar las cuentas."); }
  }
  async function createStudentAccounts() {
    const roster = parseRoster(rosterDraft);
    if (!roster.length) { setNotice("Pega la lista en tres columnas: apellido paterno, apellido materno y nombre(s)."); return; }
    const seen = new Set<string>();
    for (const item of roster) {
      const key = [item.paternalSurname, item.maternalSurname, item.givenNames].map(normalizeName).join("|");
      if (seen.has(key)) { setNotice(`La lista repite a ${item.givenNames} ${item.paternalSurname}. Corrige el duplicado antes de continuar.`); return; }
      seen.add(key);
    }
    const existingNames = new Set(students.map((s) => [s.paternal_surname, s.maternal_surname, s.given_names].map(normalizeName).join("|")));
    const existingUsers = new Set(students.map((s) => s.username.toLowerCase()));
    const newRoster = roster.filter((item) => !existingNames.has([item.paternalSurname, item.maternalSurname, item.givenNames].map(normalizeName).join("|")));
    if (!newRoster.length) { setNotice("Todos los alumnos de la lista ya tienen cuenta. Las contraseñas anteriores no se pueden volver a consultar; puedes restablecerlas una por una."); return; }
    setBusy(true); setNotice("");
    const counters = new Map<string, number>();
    const generated: CredentialCard[] = newRoster.map((item) => {
      const initials = `${item.paternalSurname[0] || "a"}${item.maternalSurname[0] || "a"}${item.givenNames.split(/\s+/)[0]?.[0] || "a"}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "a");
      let n = (counters.get(initials) || 0) + 1; let username = `${initials}${String(n).padStart(3, "0")}`;
      while (existingUsers.has(username)) { n++; username = `${initials}${String(n).padStart(3, "0")}`; }
      counters.set(initials, n); existingUsers.add(username);
      return { ...item, id: crypto.randomUUID(), username, password: randomPassword() };
    });
    try {
      const response = await apiRequest("/api/teacher/students", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ students: generated }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron crear las cuentas.");
      setStudents(data.students as StudentAccount[]); setSelectedStudentIds(generated.map(c => c.id || "")); setNotice(`Se crearon ${generated.length} cuentas. Las contraseñas quedan disponibles en esta lista y puedes imprimir las credenciales.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudieron crear las cuentas."); }
    finally { setBusy(false); }
  }
  async function resetStudentPassword(account: StudentAccount) {
    const card: CredentialCard = { id: account.id, paternalSurname: account.paternal_surname, maternalSurname: account.maternal_surname, givenNames: account.given_names, username: account.username, password: randomPassword() };
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/student-password", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ studentId: account.id, password: card.password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo restablecer la contraseña.");
      setStudents(data.students as StudentAccount[]); setNotice(`Contraseña renovada para ${account.given_names} ${account.paternal_surname}. Ya queda guardada y visible en su ficha.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo restablecer la contraseña."); }
    finally { setBusy(false); }
  }
  async function setStudentActive(account: StudentAccount) {
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/student-active", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ studentId: account.id, active: !account.active }) });
      const data = await response.json(); if (!response.ok || !Array.isArray(data.students)) throw new Error(data.error || "No se pudo actualizar la cuenta.");
      setStudents(data.students as StudentAccount[]); setNotice(account.active ? "Cuenta desactivada. Se conservaron sus resultados." : "Cuenta activada nuevamente.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo actualizar la cuenta."); }
    finally { setBusy(false); }
  }
  async function deleteStudentAccount(account: StudentAccount) {
    const name = `${account.given_names} ${account.paternal_surname} ${account.maternal_surname}`;
    if (!window.confirm(`¿Eliminar por completo la cuenta de ${name}? También se borrarán sus resultados registrados. Esta acción no se puede deshacer.`)) return;
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/student-delete", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ studentId: account.id }) });
      const data = await response.json(); if (!response.ok || !Array.isArray(data.students)) throw new Error(data.error || "No se pudo eliminar la cuenta.");
      setStudents(data.students as StudentAccount[]);
      setAttempts(old => old.filter(row => row.student_id !== account.id));
      setNotice(`Se eliminó la cuenta y los resultados de ${name}.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo eliminar la cuenta."); }
    finally { setBusy(false); }
  }
  async function manageStudentBatch(operation: "reset" | "deactivate" | "delete", ids = selectedStudentIds) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) { setNotice("Selecciona al menos un alumno."); return; }
    if (operation === "delete" && !window.confirm(`¿Eliminar por completo ${uniqueIds.length} cuenta(s) seleccionada(s) y sus resultados? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setNotice("");
    const passwords = operation === "reset" ? uniqueIds.map(studentId => ({ studentId, password: randomPassword() })) : [];
    try {
      const response = await apiRequest("/api/teacher/students-bulk", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ operation, studentIds: uniqueIds, passwords }) });
      const data = await response.json(); if (!response.ok || !Array.isArray(data.students)) throw new Error(data.error || "No se pudo completar la acción.");
      setStudents(data.students as StudentAccount[]);
      if (operation === "delete") { setAttempts(old => old.filter(row => !uniqueIds.includes(String(row.student_id || "")))); setSelectedStudentIds([]); setNotice(`Se eliminaron ${uniqueIds.length} cuentas y sus resultados.`); }
      if (operation === "deactivate") { setSelectedStudentIds([]); setNotice(`Se dieron de baja ${uniqueIds.length} cuentas. Sus resultados se conservaron.`); }
      if (operation === "reset") { setSelectedStudentIds(uniqueIds); setNotice(`Se restablecieron ${uniqueIds.length} contraseñas. Ya aparecen guardadas en las fichas y puedes imprimirlas.`); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo completar la acción."); }
    finally { setBusy(false); }
  }
  function printCredentials() {
    const selected = students.filter(s => selectedStudentIds.includes(s.id) && s.password).map(s => ({ givenNames: s.given_names, paternalSurname: s.paternal_surname, maternalSurname: s.maternal_surname, username: s.username, password: s.password || "" }));
    if (!selected.length) { setNotice("Las cuentas seleccionadas no tienen una contraseña consultable. Restablécela una vez para generar y guardar una nueva."); return; }
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) { setNotice("Permite las ventanas emergentes para imprimir las tarjetas."); return; }
    const portalUrl = new URL("?panel=alumno", window.location.href).toString();
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(portalUrl)}`;
    const cards = selected.map((c) => `<article class="card"><div class="copy"><h2>Aula en juego</h2><p class="name">${safeHtml(c.givenNames)} ${safeHtml(c.paternalSurname)} ${safeHtml(c.maternalSurname)}</p><p class="field">Usuario: <b>${safeHtml(c.username)}</b></p><p class="field">Contraseña: <b>${safeHtml(c.password)}</b></p><p class="hint">Escanea el código para abrir el portal</p></div><img class="qr" src="${qr}" alt="Código QR para entrar al portal"></article>`).join("");
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Credenciales de acceso</title><style>@page{size:letter portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17253a;margin:0}.instructions{font-size:12pt;text-align:center;margin:0 0 6mm}.sheet{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.card{min-height:48mm;border:1px dashed #487a9e;border-radius:3mm;padding:4mm;break-inside:avoid;display:flex;align-items:center;gap:4mm}.copy{min-width:0;flex:1}.card h2{font-size:12pt;margin:0 0 2mm;color:#176eaa}.card p{margin:1.2mm 0}.card .name{font-size:18pt;font-weight:bold;line-height:1.12}.card .field{font-size:16pt;overflow-wrap:anywhere}.card .hint{font-size:9pt;color:#52677b;margin-top:2mm}.qr{width:30mm;height:30mm;object-fit:contain}@media print{.instructions{margin-bottom:5mm}}</style></head><body><p class="instructions">Recorta por el borde punteado y entrega la credencial a la familia.</p><main class="sheet">${cards}</main><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
    setShowCredentialModal(false);
  }
  function addNewActivity() {
    setEditing({ ...defaultActivity, id: "", title: "", instructions: "Arrastra y suelta las chinchetas en su lugar correcto de la imagen.", timerMode: "none", timeLimitSeconds: 180, maxAttempts: 3, imageUrl: "", labels: [{ id: crypto.randomUUID(), text: "", color: palette[0], x: 50, y: 50 }] });
    setImageDraft(null); setShareLink(""); setModeTab("edit");
  }
  async function saveActivity() {
    if (!editing.title.trim()) { setNotice("Escribe el título de la actividad."); return; }
    if (!(imageDraft || editing.imageUrl)) { setNotice("Sube la imagen de esta actividad antes de guardarla."); return; }
    if (editing.labels.length < 1 || editing.labels.some((l) => !l.text.trim())) { setNotice("Completa el texto de cada etiqueta."); return; }
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/activity", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ ...editing, id: editing.id || `${slug(editing.title)}-${Date.now()}`, imageData: imageDraft }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      const savedData={...data,availableFrom:editing.availableFrom||null,availableUntil:editing.availableUntil||null};
      setEditing(savedData); setActivity(savedData); setActivities((old) => [savedData, ...old.filter((a) => a.id !== savedData.id)]);
      setImageDraft(null);
      await saveActivityAvailability(teacherKey,{...editing,id:data.id});
      window.location.assign("?panel=actividades");
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo guardar la actividad."); }
    finally { setBusy(false); }
  }
  function setEditorLabel(id: string, patch: Partial<DigestiveLabel>) { setEditing((a) => ({ ...a, labels: a.labels.map((l) => l.id === id ? { ...l, ...patch } : l) })); }
  function addLabel() { if (editing.labels.length >= 10) return; const n = editing.labels.length + 1; setEditing((a) => ({ ...a, labels: [...a.labels, { id: crypto.randomUUID(), text: "", color: palette[(n - 1) % palette.length], x: 50, y: 50 }] })); }
  function exportCSV() {
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Apellido paterno", "Apellido materno", "Nombre", "Actividad", "Aciertos", "Etiquetas", "Calificación", "Tiempo realizado (segundos)", "Tiempo restante (segundos)", "Tiempo agotado", "Fecha"], ...attempts.map((a) => [a.paternal_surname, a.maternal_surname, a.given_names, activities.find((v) => v.id === a.activity_id)?.title || a.activity_id, a.correct, a.total, a.grade, a.elapsed_seconds, a.remaining_seconds, a.timed_out ? "Sí" : "No", a.submitted_at])];
    const blob = new Blob(["\ufeff" + rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "resultados-etiquetas.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  const editorImage = imageDraft || editing.imageUrl || "";
  const placedCount = Object.keys(placements).length;
  const labelsForLines = useMemo(() => activity.labels, [activity.labels]);
  const parsedRoster = parseRoster(rosterDraft);
  const filteredStudents = students.filter(student => {
    const name = `${student.paternal_surname} ${student.maternal_surname} ${student.given_names} ${student.username}`.toLocaleLowerCase("es-MX");
    return name.includes(studentSearch.trim().toLocaleLowerCase("es-MX")) && (studentFilter === "all" || (studentFilter === "active" ? student.active : !student.active));
  });
  const visibleStudentIds = filteredStudents.map(student => student.id);
  const allVisibleSelected = visibleStudentIds.length > 0 && visibleStudentIds.every(id => selectedStudentIds.includes(id));
  const studentManagement = <section className="results-section account-section">
    <div className="results-heading"><div><div className="eyebrow">Acceso de alumnos</div><h1>Mis alumnos</h1><p>{students.length} cuentas. Las contraseñas nuevas quedan guardadas para que puedas consultarlas e imprimirlas.</p></div></div>
    <div className="roster-actions"><details className="roster-import"><summary>＋ Agregar alumno</summary><div className="roster-import-body"><label>Pega la lista de alumnos<textarea className="roster-input" rows={6} value={rosterDraft} onChange={(e) => setRosterDraft(e.target.value)} placeholder={`Una fila por alumno; columnas separadas por tabulador:\nApellido paterno [tab] Apellido materno [tab] Nombre(s)`} /></label><p className="preview-help">Se detectaron {parsedRoster.length} alumnos. Los usuarios se forman con iniciales y un número; las contraseñas son aleatorias. No incluyas CURP ni fecha de nacimiento.</p><div className="save-row"><button className="primary" disabled={busy || parsedRoster.length === 0} onClick={() => void createStudentAccounts()}>{busy ? "Creando…" : "Agregar y generar accesos"}</button></div></div></details><button className="secondary" onClick={() => { setSelectedStudentIds(students.map(s => s.id)); setShowCredentialModal(true); }}>▤ Imprimir credenciales de acceso</button></div>
    <div className="roster-toolbar"><label>Buscar<input value={studentSearch} onChange={event=>setStudentSearch(event.target.value)} placeholder="Nombre o usuario"/></label><label>Estado<select value={studentFilter} onChange={event=>setStudentFilter(event.target.value as "all"|"active"|"inactive")}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Dados de baja</option></select></label><span>{filteredStudents.length} de {students.length} alumnos</span></div>
    <div className="student-bulkbar"><label><input type="checkbox" checked={allVisibleSelected} onChange={event=>setSelectedStudentIds(event.target.checked ? [...new Set([...selectedStudentIds, ...visibleStudentIds])] : selectedStudentIds.filter(id=>!visibleStudentIds.includes(id)))}/> Seleccionar todos los visibles</label><span>{selectedStudentIds.length} seleccionados</span><button className="small-button" disabled={busy || !selectedStudentIds.length} onClick={()=>void manageStudentBatch("reset")}>Restablecer contraseñas</button><button className="small-button" disabled={busy || !selectedStudentIds.length} onClick={()=>void manageStudentBatch("deactivate")}>Dar de baja</button><button className="small-button remove-button" disabled={busy || !selectedStudentIds.length} onClick={()=>void manageStudentBatch("delete")}>Eliminar</button></div>
    {filteredStudents.length ? <div className="student-card-grid">{filteredStudents.map(s => <article className="student-account-card" key={s.id}><label className="student-select"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={event=>setSelectedStudentIds(old=>event.target.checked ? [...new Set([...old,s.id])] : old.filter(id=>id!==s.id))}/><span>{s.active ? "Activa" : "Dada de baja"}</span></label><h2>{s.given_names} {s.paternal_surname} {s.maternal_surname}</h2><p className="student-username">Usuario: <strong>{s.username}</strong></p><div className="student-password"><span>Contraseña</span><strong>{s.password || "No disponible: restablece una vez"}</strong></div><div className="student-card-actions"><button className="small-button" disabled={busy} onClick={()=>void resetStudentPassword(s)}>Restablecer</button><button className="small-button" disabled={busy} onClick={()=>void setStudentActive(s)}>{s.active ? "Dar de baja" : "Reactivar"}</button><button className="small-button remove-button" disabled={busy} onClick={()=>void deleteStudentAccount(s)}>Eliminar</button></div></article>)}</div> : <div className="empty-state">{students.length ? "No encontramos alumnos con esos filtros." : "Todavía no hay cuentas. Pulsa «Agregar alumno» para comenzar."}</div>}
    {notice && <p className={`notice ${notice.includes("crearon") || notice.includes("renovada") || notice.includes("restablecieron") ? "success" : "error"} center-notice`}>{notice}</p>}
    {showCredentialModal && <div className="credential-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowCredentialModal(false)}}><section className="credential-modal" role="dialog" aria-modal="true" aria-labelledby="credential-modal-title"><div className="credential-modal-heading"><div><div className="eyebrow">Impresión</div><h2 id="credential-modal-title">¿A quiénes imprimimos credencial?</h2><p>Elige uno, varios o todos. Cada tarjeta llevará nombre, usuario, contraseña y QR.</p></div><button className="modal-close" onClick={()=>setShowCredentialModal(false)} aria-label="Cerrar">×</button></div><div className="credential-modal-tools"><button className="small-button" onClick={()=>setSelectedStudentIds(students.map(s=>s.id))}>Seleccionar todos</button><button className="small-button" onClick={()=>setSelectedStudentIds([])}>Quitar selección</button><span>{selectedStudentIds.length} seleccionados</span></div><div className="credential-modal-list">{students.map(s=><label key={s.id}><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={event=>setSelectedStudentIds(old=>event.target.checked?[...new Set([...old,s.id])]:old.filter(id=>id!==s.id))}/><span>{s.given_names} {s.paternal_surname} {s.maternal_surname}</span><small>{s.password ? `Usuario ${s.username}` : "Contraseña pendiente de restablecer"}</small></label>)}</div><div className="credential-modal-footer"><button className="secondary" onClick={()=>setShowCredentialModal(false)}>Cancelar</button><button className="primary" disabled={!selectedStudentIds.some(id=>students.some(s=>s.id===id&&Boolean(s.password)))} onClick={printCredentials}>Imprimir credenciales ({students.filter(s=>selectedStudentIds.includes(s.id)&&s.password).length})</button></div></section></div>}
  </section>;

  if (screen === "catalog") return <Catalog />;

  if (screen === "teacher") return <main className="page teacher-page">
    <header className="topbar teacher-topbar"><a className="brand" href="?panel=actividades"><span className="brand-mark">A</span><span>Aula en juego</span></a>{teacherUnlocked&&<nav className="teacher-tabs teacher-nav" aria-label="Navegación docente"><a className={modeTab === "edit" ? "active" : "quiet"} href="?panel=actividades"><TeacherNavIcon name="games" /> Panel de juegos</a><button className={modeTab === "students" ? "active" : "quiet"} onClick={() => { setModeTab("students"); setNotice(""); void loadStudents(); }}><TeacherNavIcon name="students" /> Mis alumnos</button><a className={modeTab === "results" ? "active" : "quiet"} href="?panel=resultados"><TeacherNavIcon name="results" /> Mis resultados</a><a className="quiet" href="?panel=actividades"><TeacherNavIcon name="home" /> Inicio</a><button className="quiet" onClick={() => { void logoutTeacher(); setTeacherUnlocked(false); setTeacherKey(""); setTeacherSessionState("signed-out"); }}><TeacherNavIcon name="logout" /> Cerrar sesión</button></nav>}</header>
    {!teacherUnlocked ? teacherSessionState === "checking" ? <section className="access-card" aria-live="polite"><div className="eyebrow">Acceso docente</div><h1>Comprobando tu sesión</h1><p>Espera un momento; no necesitas volver a escribir la contraseña.</p></section> : teacherSessionState === "error" && getTeacherKey() ? <section className="access-card" aria-live="polite"><div className="eyebrow">No se pudo conectar</div><h1>Tu sesión sigue guardada</h1><p>{notice || "No recibimos respuesta del servidor."}</p><button className="primary" disabled={busy} onClick={() => void unlockTeacher(getTeacherKey())}>Reintentar</button><button className="secondary" onClick={() => { void logoutTeacher(); setTeacherKey(""); setTeacherSessionState("signed-out"); setNotice(""); }}>Iniciar sesión con otra cuenta</button></section> : <form className="access-card" onSubmit={(e) => { e.preventDefault(); void teacherSignIn(); }}><div className="eyebrow">Acceso docente</div><h1>Inicia sesión como maestro</h1><p>Usa tu usuario y contraseña para administrar actividades y cuentas de alumnos.</p><label>Nombre de usuario<input required autoComplete="username" value={teacherCredentials.username} onChange={(e) => setTeacherCredentials({ ...teacherCredentials, username: e.target.value })} /></label><label>Contraseña<PasswordField required autoComplete="current-password" value={teacherCredentials.password} onChange={(e) => setTeacherCredentials({ ...teacherCredentials, password: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? "Verificando…" : "Entrar"}</button>{notice && <p className="notice error">{notice}</p>}</form> : <>
      {modeTab === "edit" ? <section className="editor-layout"><div className="editor-main"><EditorWorkflow template="Diagrama con etiquetas"/><div className="editor-controls"><EditorContentHeader title={editing.title} instructions={editing.instructions} onTitleChange={(title) => setEditing({ ...editing, title })} onInstructionsChange={(instructions) => setEditing({ ...editing, instructions })}/><div className="step-heading"><b>1</b><strong>Sube la imagen</strong><span>Elige la imagen que servirá para colocar las etiquetas.</span></div><div className="upload-label"><span>Imagen del tema</span><EditorImagePicker value={imageDraft||editing.imageUrl} onChange={(value) => { setImageDraft(value || null); if (!value) setEditing(current => ({ ...current, imageUrl: "" })); }}/><small>PNG, JPG o WebP · máximo 5 MB</small></div><div className="step-heading"><b>2</b><strong>Escribe las etiquetas</strong><span>Agrega hasta 10 palabras y elige sus colores.</span></div><div className="split-controls"><label>Reloj<select value={editing.timerMode} onChange={(e) => setEditing({ ...editing, timerMode: e.target.value as Activity["timerMode"] })}><option value="none">Sin límite</option><option value="up">Contar el tiempo</option><option value="down">Cuenta regresiva</option></select></label><label>Intentos permitidos<select value={editing.maxAttempts === null ? "unlimited" : String(editing.maxAttempts ?? 3)} onChange={(e) => setEditing({ ...editing, maxAttempts: e.target.value === "unlimited" ? null : Number(e.target.value) })}><option value="unlimited">Ilimitados</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} intento{i ? "s" : ""}</option>)}</select></label>{editing.timerMode === "down" && <label>Minutos<input type="number" min="1" max="60" value={Math.round(editing.timeLimitSeconds / 60)} onChange={(e) => setEditing({ ...editing, timeLimitSeconds: Math.max(60, Number(e.target.value) * 60) })} /></label>}</div></div><ActivitySettings value={editing} onChange={setEditing} includeCoreControls={false} includeCoverImage={false}/><div className="label-editor"><div className="label-editor-heading"><div><h2>3. Coloca las etiquetas en la imagen</h2><p>Arrastra el botón de ubicación hasta el punto correcto. En celular, selecciónalo y toca la imagen.</p></div><span>{editing.labels.length}/10</span></div><div className="label-list">{editing.labels.map((label) => <div className={`label-row ${activeLabel === label.id ? "chosen" : ""}`} key={label.id}><button className="color-dot" style={{ background: label.color }} onClick={() => setActiveLabel(label.id)} aria-label={`Seleccionar ${label.text || "etiqueta"}`} /><input value={label.text} onFocus={() => setActiveLabel(label.id)} onChange={(e) => setEditorLabel(label.id, { text: e.target.value })} placeholder={`Etiqueta ${editing.labels.indexOf(label) + 1}`} /><input className="color-input" type="color" value={label.color} onChange={(e) => setEditorLabel(label.id, { color: e.target.value })} aria-label="Color de etiqueta" /><button className="small-button" draggable onDragStart={(e) => { e.dataTransfer.setData("text/label-id", label.id); setActiveLabel(label.id); }} onClick={() => setActiveLabel(label.id)}>{activeLabel === label.id ? "Llévame a la imagen" : `${Math.round(label.x)}%, ${Math.round(label.y)}%`}</button><EditorItemActions index={editing.labels.findIndex(item=>item.id===label.id)} onDragReorder={(from,to)=>setEditing(current=>{const labels=[...current.labels],[item]=labels.splice(from,1);labels.splice(to,0,item);return {...current,labels}})} first={editing.labels[0]?.id===label.id} last={editing.labels[editing.labels.length-1]?.id===label.id} duplicateDisabled={editing.labels.length>=10} deleteDisabled={editing.labels.length<=1} onMoveUp={()=>setEditing(current=>{const next=[...current.labels],i=next.findIndex(item=>item.id===label.id);if(i>0)[next[i-1],next[i]]=[next[i],next[i-1]];return {...current,labels:next}})} onMoveDown={()=>setEditing(current=>{const next=[...current.labels],i=next.findIndex(item=>item.id===label.id);if(i>=0&&i<next.length-1)[next[i],next[i+1]]=[next[i+1],next[i]];return {...current,labels:next}})} onDuplicate={()=>setEditing(current=>{const i=current.labels.findIndex(item=>item.id===label.id),copy={...label,id:crypto.randomUUID(),text:label.text?label.text+" (copia)":"",x:Math.min(96,label.x+3),y:Math.min(96,label.y+3)};return {...current,labels:[...current.labels.slice(0,i+1),copy,...current.labels.slice(i+1)]}})} onDelete={()=>setEditing(current=>({...current,labels:current.labels.filter(item=>item.id!==label.id)}))}/></div>)}</div>{editing.labels.length < 10 && <button className="add-label" onClick={addLabel}>＋ Añadir etiqueta</button>}</div><div className="save-row"><button className="primary" disabled={busy} onClick={() => void saveActivity()}>{busy ? "Guardando…" : "Guardar actividad"}</button>{notice && <p className={notice.startsWith("Actividad guardada") ? "notice success" : "notice error"}>{notice}</p>}</div>{shareLink && <div className="share-card"><div><strong>Enlace para tus alumnos</strong><span>{shareLink}</span></div><button className="secondary" onClick={async () => { await navigator.clipboard.writeText(shareLink); setCopied(true); }}> {copied ? "Copiado" : "Copiar enlace"}</button></div>}</div>
      <aside className="editor-preview"><div className="preview-kicker">3 · Ubica cada respuesta</div><div className="preview-title">{editing.title || "Vista previa de la actividad"}</div><div className="editor-stage" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/label-id") || activeLabel; if (!id) return; const r = e.currentTarget.getBoundingClientRect(); setEditorLabel(id, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); setActiveLabel(id); }} onClick={(e) => { if (!activeLabel) { setNotice("Selecciona primero una etiqueta."); return; } const r = e.currentTarget.getBoundingClientRect(); setEditorLabel(activeLabel, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}>{editorImage ? <img src={editorImage} alt="Vista previa del dibujo" /> : <div className="editor-image-empty"><span aria-hidden="true">＋</span><strong>La imagen aparecerá aquí</strong><small>Sube una imagen para comenzar</small></div>}{editorImage&&editing.labels.map((label) => <span className="target-dot editing-dot" key={label.id} style={{ left: `${label.x}%`, top: `${label.y}%`, borderColor: label.color }} title={label.text} />)}</div><p className="preview-help">{activeLabel ? "Toca el lugar de la imagen donde va la etiqueta seleccionada." : "Selecciona una etiqueta para marcar su punto."}</p></aside></section> : modeTab === "results" ? <section className="results-section"><div className="results-heading"><div><div className="eyebrow">Seguimiento</div><h1>Resultados de los alumnos</h1><p>{attempts.length} participaciones registradas</p></div><button className="secondary" onClick={exportCSV}>Descargar hoja CSV</button></div><div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Actividad</th><th>Aciertos</th><th>Calificación</th><th>Tiempo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{attempts.map((a) => <tr key={a.id}><td>{a.paternal_surname} {a.maternal_surname}, {a.given_names}</td><td>{activities.find((v) => v.id === a.activity_id)?.title || a.activity_id}</td><td>{a.correct}/{a.total}</td><td><strong>{Number(a.grade).toFixed(1)}</strong></td><td>{fmt(a.elapsed_seconds)}{a.remaining_seconds !== null ? ` · sobró ${fmt(a.remaining_seconds)}` : ""}</td><td>{a.timed_out ? "Tiempo agotado" : "Terminado"}</td><td>{new Date(a.submitted_at).toLocaleString("es-MX")}</td></tr>)}</tbody></table>{attempts.length === 0 && <div className="empty-state">Todavía no hay participaciones guardadas.</div>}</div></section> : studentManagement}
    </>}
  </main>;

  if (screen === "result") return <main className="page result-page"><header className="topbar"><a className="brand" href={previewMode?"?panel=actividades":"./"}><span className="brand-mark">10</span><span>Diagrama con etiquetas</span></a></header><section className="result-card"><div className="result-orbit">{result?.correct ?? 0}<small>de {result?.total ?? activity.labels.length}</small></div><div className="eyebrow">{previewMode?"Prueba docente · no registrada":"Actividad terminada"}</div><h1>{result?.grade.toFixed(1)} <span>/ 10</span></h1><p>{previewMode?"Este resultado solo aparece en la vista previa; no se guardó.":`${student.givenNames}, revisa tus resultados con tu maestro.`}</p><div className="result-stats"><div><span>Aciertos</span><strong>{result?.correct}/{result?.total}</strong></div><div><span>Tiempo realizado</span><strong>{fmt(result?.elapsedSeconds ?? seconds)}</strong></div><div><span>{result?.timedOut ? "Estado" : result?.remainingSeconds !== null ? "Tiempo restante" : "Estado"}</span><strong>{result?.timedOut ? "Se agotó" : result?.remainingSeconds !== null ? fmt(result?.remainingSeconds ?? 0) : "Completado"}</strong></div></div>{!previewMode&&<div className={`attempts-notice ${(result?.attemptsRemaining ?? 0) > 0 || result?.attemptsRemaining === null ? "available" : "used"}`}>{result?.attemptsRemaining === null ? "Puedes volver a intentarlo cuando quieras." : result?.attemptsRemaining === 1 ? "Te queda 1 intento." : result?.attemptsRemaining && result.attemptsRemaining > 1 ? `Te quedan ${result.attemptsRemaining} intentos.` : "Ya utilizaste todos tus intentos."}</div>}<div className="result-actions">{previewMode?<button className="primary" onClick={retryGame}>Probar de nuevo</button>:result && (result.attemptsRemaining === null || result.attemptsRemaining > 0) && <button className="primary" onClick={retryGame}>Intentar de nuevo</button>}<a className="secondary" href={previewMode?"?panel=actividades":"?panel=alumno"}>{previewMode?"Volver a Mis actividades":"Ir a mis actividades"}</a></div></section>{!previewMode&&activity.showAnswersAtEnd&&<ActivityAnswerKey activity={activity}/ >}{!previewMode&&activity.showLeaderboard&&<ActivityLeaderboard rows={leaderboard}/>}</main>;

  return <main className={`page game-page ${screen === "play" ? "is-playing" : ""}`}><FocusBlurGuard enabled={activity.blurWhenInactive===true} active={screen==="play"}/><header className="topbar"><a className="brand" href="./"><span className="brand-mark">10</span><span>Diagrama con etiquetas</span></a><div className="top-actions"><a className="teacher-link catalog-return" href="./">Todos los juegos</a><button className={`sound-toggle ${muted ? "is-muted" : ""}`} onClick={() => setMuted(!muted)} aria-label={muted ? "Activar sonidos" : "Silenciar sonidos"}>{muted ? "Sonido apagado" : "Sonido activado"}</button><a className="teacher-link" href="?panel=actividades">Mis actividades</a></div></header>
    {screen === "intro" ? <section className="intro-layout"><div className="intro-copy"><div className="eyebrow">Ciencias · 4.º grado</div><h1>{activity.title}</h1><p className="instructions">{activity.instructions}</p><div className="timer-note">{activity.timerMode === "down" ? `Cuenta regresiva: ${fmt(activity.timeLimitSeconds)}` : activity.timerMode === "up" ? "El reloj contará cuánto tardas." : "Sin límite de tiempo."}</div><form className="student-form" onSubmit={(e) => { e.preventDefault(); void loginStudent(); }}>{previewMode?<><div className="form-title">Vista previa docente</div><p>Juega para revisar la actividad. No se guardarán resultados.</p><button className="primary start-button" type="button" disabled={busy} onClick={() => void startGame()}>{busy?"Preparando…":"Probar actividad"}</button></>:studentToken && student.givenNames ? <><div className="form-title">Hola, {student.givenNames} {student.paternalSurname}</div><p>Tu sesión de alumno sigue activa en este dispositivo.</p><button className="primary start-button" type="button" disabled={busy} onClick={() => void startGame()}>{busy?"Preparando…":"Comenzar actividad"}</button><button className="text-button" type="button" onClick={()=>{clearStudentSession();setStudentToken("");setStudent(emptyStudent);}}>Cambiar de alumno</button></> : <><div className="form-title">Entra con tu usuario y contraseña</div><label>Usuario<input required value={studentCredentials.username} onChange={(e) => setStudentCredentials({ ...studentCredentials, username: e.target.value })} autoComplete="username" /></label><label>Contraseña<PasswordField required value={studentCredentials.password} onChange={(e) => setStudentCredentials({ ...studentCredentials, password: e.target.value })} autoComplete="current-password" /></label><button className="primary start-button" type="submit" disabled={busy}>{busy ? "Verificando cuenta…" : "Entrar y comenzar"}</button></>}{notice && <p className="notice error">{notice}</p>}{!previewMode&&<><button className="text-button" type="button" onClick={() => setShowLeaderboard(!showLeaderboard)}>Tabla de posiciones {showLeaderboard ? "▲" : "▼"}</button>{showLeaderboard && <div className="leaderboard-list intro-ranking">{leaderboard.map((item) => <div key={item.rank} className={`leader-row ${item.rank <= 3 ? `rank-special rank-${item.rank}` : "rank-standard"}`}><span className="rank-badge">{item.rank <= 3 ? ["🥇", "🥈", "🥉"][item.rank - 1] : item.rank}</span><span className="leader-name">{item.name} {item.paternalSurname}</span><span className="leader-score">{item.grade.toFixed(1)} / 10</span><span className="leader-time">{item.attempts} intentos</span></div>)}</div>}</>}</form></div><div className="intro-art"><img src={activity.imageUrl} alt="Ilustración del aparato digestivo"/><div className="art-caption"><span>10 etiquetas</span><span>Arrastra y une</span></div></div></section> : <section className="play-area"><div className="play-heading"><div><div className="eyebrow">{activity.title}</div><p>{activity.instructions}</p></div><div className={`timer ${remaining !== null && remaining < 20 ? "urgent" : ""}`}><span>{activity.timerMode === "down" ? "Te queda" : activity.timerMode === "up" ? "Tiempo" : "Listo"}</span><strong>{activity.timerMode === "none" ? "∞" : clockText}</strong></div></div><div className="play-progress"><span>{placedCount} de {activity.labels.length} etiquetas colocadas</span><button className="text-button" onClick={() => setMuted(!muted)}>{muted ? "Activar sonidos" : "Silenciar sonidos"}</button></div><div className="board" ref={boardRef}><svg className="connector-layer" aria-hidden="true">{lines.map((line) => <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} strokeWidth="3" strokeLinecap="round" />)}</svg><div className="game-stage" ref={stageRef}><img src={activity.imageUrl} alt="Ilustración para señalar las partes" draggable={false}/>{activity.labels.map((label) => { const placedAt = Object.entries(placements).find(([, targetId]) => targetId === label.id); return <span key={label.id} className={`target-dot ${placedAt ? "occupied" : ""}`} style={{ left: `${label.x}%`, top: `${label.y}%`, borderColor: placedAt ? activity.labels.find((item) => item.id === placedAt[0])?.color : undefined }} aria-label="Punto para unir etiqueta" />; })}</div><div className="tag-tray">{playLabels.map((label, i) => <button key={label.id} ref={(el) => { chipsRef.current[label.id] = el; }} className={`tag-chip ${selected === label.id ? "selected" : ""} ${placements[label.id] ? "placed" : ""}`} style={{ "--tag-color": label.color } as React.CSSProperties} onClick={() => setSelected(label.id)} onPointerDown={(e) => beginDrag(e, label)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} aria-label={`Arrastrar etiqueta ${label.text}`}><span className="tag-index">{i + 1}</span><span>{label.text}</span>{placements[label.id] && <span className="placed-mark">●</span>}</button>)}</div></div>{selected && <div className="selected-readout"><span>Etiqueta seleccionada</span><strong style={{ color: activity.labels.find((l) => l.id === selected)?.color }}>{activity.labels.find((l) => l.id === selected)?.text}</strong><small>En celular, tócala y arrástrala al punto.</small></div>}<div className="play-footer"><button className="primary" disabled={busy} onClick={() => void submit(false)}>{busy ? (previewMode?"Calculando…":"Guardando…") : (previewMode?"Terminar prueba":"Terminar y enviar")}</button><span>Las etiquetas se pueden mover otra vez antes de enviar.</span></div>{notice && <p className="notice error center-notice">{notice}</p>}{drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y, "--tag-color": activity.labels.find((l) => l.id === drag.id)?.color || "#2684e8" } as React.CSSProperties}>{activity.labels.find((l) => l.id === drag.id)?.text}</div>}</section>}
  </main>;
}
