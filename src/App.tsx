"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultActivity, type Activity, type DigestiveLabel } from "./default-activity";
import { apiRequest, forgetTeacherKey, getTeacherKey, rememberTeacherKey } from "./gas-client";
import Catalog from "./Catalog";

type Screen = "catalog" | "intro" | "play" | "result" | "teacher";
type Result = { correct: number; total: number; grade: number; elapsedSeconds: number; remainingSeconds: number | null; timedOut: boolean; attemptsUsed: number; attemptsRemaining: number | null; maxAttempts: number | null };
type Leader = { rank: number; name: string; paternalSurname: string; correct: number; total: number; grade: number; elapsedSeconds: number };
type Attempt = { id: number; activity_id: string; paternal_surname: string; maternal_surname: string; given_names: string; correct: number; total: number; grade: number; elapsed_seconds: number; remaining_seconds: number | null; timed_out: number; submitted_at: string };
type StudentAccount = { id: string; paternal_surname: string; maternal_surname: string; given_names: string; username: string; active: boolean; password_version?: string };
type CredentialCard = { id?: string; paternalSurname: string; maternalSurname: string; givenNames: string; username: string; password: string };
const palette = ["#2789e8", "#d849cc", "#fa7a16", "#18884a", "#a739cc", "#ef563f", "#2548d8", "#13a783", "#d17b18", "#e52e45"];
const emptyStudent = { paternalSurname: "", maternalSurname: "", givenNames: "" };

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
  const [activity, setActivity] = useState<Activity>(defaultActivity);
  const [screen, setScreen] = useState<Screen>("catalog");
  const [student, setStudent] = useState(emptyStudent);
  const [studentToken, setStudentToken] = useState("");
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
  const [keyDraft, setKeyDraft] = useState(() => getTeacherKey());
  const [teacherUnlocked, setTeacherUnlocked] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [editing, setEditing] = useState<Activity>(defaultActivity);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [modeTab, setModeTab] = useState<"edit" | "results" | "students">("edit");
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [rosterDraft, setRosterDraft] = useState("");
  const [credentials, setCredentials] = useState<CredentialCard[]>([]);
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
      const ranking = await apiRequest(`/api/leaderboard?activityId=${encodeURIComponent(id)}`);
      if (ranking.ok) setLeaderboard(await ranking.json() as Leader[]);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo cargar la actividad."); }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("modo") === "maestro") { setScreen("teacher"); const savedKey = getTeacherKey(); if (savedKey) void unlockTeacher(savedKey); return; }
    const activityId = query.get("actividad");
    if (!activityId) { setScreen("catalog"); return; }
    setScreen("intro");
    void loadActivity(activityId);
  }, [loadActivity]);

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
      const response = await apiRequest("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: activity.id, ...student, studentToken, placements, elapsedSeconds: elapsed, remainingSeconds: activity.timerMode === "down" ? Math.max(0, activity.timeLimitSeconds - elapsed) : null, timedOut }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar el resultado.");
      setResult(data); setScreen("result"); sound(timedOut ? "timeout" : "finish");
      const ranking = await apiRequest(`/api/leaderboard?activityId=${encodeURIComponent(activity.id)}`);
      if (ranking.ok) setLeaderboard(await ranking.json() as Leader[]);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo guardar el resultado."); }
    finally { setBusy(false); }
  }

  async function startGame(profile = student, token = studentToken) {
    if (!token || !profile.paternalSurname.trim() || !profile.maternalSurname.trim() || !profile.givenNames.trim()) { setNotice("Inicia sesión con tu usuario y contraseña para comenzar."); return; }
    setBusy(true); setNotice("");
    try { const params = new URLSearchParams({ activityId: activity.id, ...profile, studentToken: token }); const response = await apiRequest(`/api/attempts?${params}`); const availability = await response.json(); if (!response.ok) throw new Error(availability.error || "No se pudieron revisar tus intentos."); if (!availability.canStart) throw new Error("Ya utilizaste todos tus intentos para esta actividad."); } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo revisar tus intentos."); setBusy(false); return; }
    setBusy(false);
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
      setStudent(profile); setStudentToken(token); setStudentCredentials({ username: "", password: "" }); setBusy(false);
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

  async function unlockTeacher(accessKey = keyDraft) {
    setNotice("");
    const headers = { "x-teacher-key": accessKey };
    try {
      const response = await apiRequest("/api/teacher/activities", { headers }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo verificar el acceso.");
      const diagramActivities = (data as Activity[]).filter((item) => !item.kind || item.kind === "diagram");
      setTeacherKey(accessKey); setKeyDraft(accessKey); rememberTeacherKey(accessKey); setTeacherUnlocked(true); setActivities(diagramActivities);
      const query = new URLSearchParams(window.location.search);
      if (query.get("nueva") === "1") addNewActivity();
      else { const selectedId = query.get("actividad"); setEditing(diagramActivities.find((a) => a.id === (selectedId || activity.id)) || activity); }
      await loadResults(accessKey);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Revisa la clave del maestro."); }
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
      setStudents(data.students as StudentAccount[]); setCredentials(generated); setNotice(`Se crearon ${generated.length} cuentas. Imprime o guarda las tarjetas ahora; las contraseñas no se muestran otra vez.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudieron crear las cuentas."); }
    finally { setBusy(false); }
  }
  async function resetStudentPassword(account: StudentAccount) {
    const card: CredentialCard = { id: account.id, paternalSurname: account.paternal_surname, maternalSurname: account.maternal_surname, givenNames: account.given_names, username: account.username, password: randomPassword() };
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/student-password", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ studentId: account.id, password: card.password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo restablecer la contraseña.");
      setCredentials([card]); setNotice(`Contraseña renovada para ${account.given_names} ${account.paternal_surname}. Imprime la nueva tarjeta ahora.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo restablecer la contraseña."); }
    finally { setBusy(false); }
  }
  function printCredentials() {
    if (!credentials.length) { setNotice("Primero crea las cuentas o restablece una contraseña."); return; }
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) { setNotice("Permite las ventanas emergentes para imprimir las tarjetas."); return; }
    const cards = credentials.map((c) => `<article class="card"><h2>Diagrama con etiquetas</h2><p class="name">${safeHtml(c.givenNames)} ${safeHtml(c.paternalSurname)} ${safeHtml(c.maternalSurname)}</p><p>Usuario: <b>${safeHtml(c.username)}</b></p><p>Contraseña: <b>${safeHtml(c.password)}</b></p><small>Guarda esta tarjeta. El maestro puede restablecer la contraseña si se pierde.</small></article>`).join("");
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Accesos de alumnos</title><style>@page{size:letter portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17253a;margin:0}.instructions{font-size:12px;text-align:center;margin:0 0 8mm}.sheet{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.card{height:43mm;border:1px dashed #487a9e;border-radius:5mm;padding:4mm;break-inside:avoid}.card h2{font-size:12pt;margin:0 0 2mm;color:#176eaa}.card p{margin:1.2mm 0;font-size:11pt}.card .name{font-size:13pt;font-weight:bold}.card small{display:block;margin-top:2mm;color:#52677b;font-size:8pt}@media print{.instructions{margin-bottom:5mm}}</style></head><body><p class="instructions">Recorta las tarjetas y entrega una a cada familia. Conserva las contraseñas en privado.</p><main class="sheet">${cards}</main><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }
  function addNewActivity() {
    setEditing({ ...defaultActivity, id: "", title: "", instructions: "Arrastra y suelta las chinchetas en su lugar correcto de la imagen.", timerMode: "none", timeLimitSeconds: 180, maxAttempts: 3, labels: [{ id: crypto.randomUUID(), text: "", color: palette[0], x: 50, y: 50 }] });
    setImageDraft(null); setShareLink(""); setModeTab("edit");
  }
  async function saveActivity() {
    if (!editing.title.trim()) { setNotice("Escribe el título de la actividad."); return; }
    if (editing.labels.length < 1 || editing.labels.some((l) => !l.text.trim())) { setNotice("Completa el texto de cada etiqueta."); return; }
    setBusy(true); setNotice("");
    try {
      const response = await apiRequest("/api/teacher/activity", { method: "POST", headers: { "Content-Type": "application/json", "x-teacher-key": teacherKey }, body: JSON.stringify({ ...editing, id: editing.id || `${slug(editing.title)}-${Date.now()}`, imageData: imageDraft }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      setEditing(data); setActivity(data); setActivities((old) => [data, ...old.filter((a) => a.id !== data.id)]);
      setImageDraft(null);
      const url = new URL(window.location.href); url.search = `?actividad=${encodeURIComponent(data.id)}`; setShareLink(url.toString()); setCopied(false);
      setNotice("Actividad guardada. Ya puedes copiar el enlace para tus alumnos.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "No se pudo guardar la actividad."); }
    finally { setBusy(false); }
  }
  async function selectActivity(id: string) {
    const known = activities.find((a) => a.id === id); if (known) { setEditing(known); setImageDraft(null); setShareLink(""); }
    else { await loadActivity(id); setEditing(activity); }
  }
  async function handleImage(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setNotice("Selecciona una imagen PNG, JPG o WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { setNotice("La imagen debe pesar menos de 5 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setImageDraft(String(reader.result)); reader.readAsDataURL(file);
  }
  function setEditorLabel(id: string, patch: Partial<DigestiveLabel>) { setEditing((a) => ({ ...a, labels: a.labels.map((l) => l.id === id ? { ...l, ...patch } : l) })); }
  function addLabel() { if (editing.labels.length >= 10) return; const n = editing.labels.length + 1; setEditing((a) => ({ ...a, labels: [...a.labels, { id: crypto.randomUUID(), text: "", color: palette[(n - 1) % palette.length], x: 50, y: 50 }] })); }
  function exportCSV() {
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Apellido paterno", "Apellido materno", "Nombre", "Actividad", "Aciertos", "Etiquetas", "Calificación", "Tiempo realizado (segundos)", "Tiempo restante (segundos)", "Tiempo agotado", "Fecha"], ...attempts.map((a) => [a.paternal_surname, a.maternal_surname, a.given_names, activities.find((v) => v.id === a.activity_id)?.title || a.activity_id, a.correct, a.total, a.grade, a.elapsed_seconds, a.remaining_seconds, a.timed_out ? "Sí" : "No", a.submitted_at])];
    const blob = new Blob(["\ufeff" + rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "resultados-etiquetas.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  const editorImage = imageDraft || editing.imageUrl || "/sistema-digestivo.png";
  const placedCount = Object.keys(placements).length;
  const labelsForLines = useMemo(() => activity.labels, [activity.labels]);
  const parsedRoster = parseRoster(rosterDraft);
  const studentManagement = <section className="results-section account-section"><div className="results-heading"><div><div className="eyebrow">Acceso de alumnos</div><h1>Cuentas y tarjetas</h1><p>{students.length} cuentas registradas. Las contraseñas se guardan como hash y solo se muestran al crearlas o renovarlas.</p></div>{credentials.length > 0 && <button className="secondary" onClick={printCredentials}>Imprimir tarjetas ({credentials.length})</button>}</div><div className="roster-import"><label>Lista del grupo<textarea className="roster-input" rows={9} value={rosterDraft} onChange={(e) => setRosterDraft(e.target.value)} placeholder={'Pega tres columnas desde tu hoja de cálculo, en este orden:\nApellido paterno [tab] Apellido materno [tab] Nombre(s)'} /></label><p className="preview-help">Se detectaron {parsedRoster.length} alumnos. Los usuarios se forman con iniciales y un número; las contraseñas son aleatorias. No incluyas CURP ni fecha de nacimiento.</p><div className="save-row"><button className="primary" disabled={busy || parsedRoster.length === 0} onClick={() => void createStudentAccounts()}>{busy ? "Creando cuentas…" : "Crear cuentas nuevas"}</button><button className="secondary" onClick={() => void loadStudents()}>Actualizar lista</button></div></div><div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Usuario</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{students.map((s) => <tr key={s.id}><td>{s.paternal_surname} {s.maternal_surname}, {s.given_names}</td><td><strong>{s.username}</strong></td><td>{s.active ? "Activa" : "Desactivada"}</td><td><button className="small-button" disabled={busy} onClick={() => void resetStudentPassword(s)}>Generar contraseña nueva</button></td></tr>)}</tbody></table>{students.length === 0 && <div className="empty-state">Todavía no hay cuentas. Pega la lista de alumnos para comenzar.</div>}</div>{notice && <p className={`notice ${notice.includes("crearon") || notice.includes("renovada") ? "success" : "error"} center-notice`}>{notice}</p>}</section>;

  if (screen === "catalog") return <Catalog />;

  if (screen === "teacher") return <main className="page teacher-page">
    <header className="topbar"><a className="brand" href="./"><span className="brand-mark">10</span><span>Diagrama con etiquetas</span></a><span className="teacher-pill">Panel del maestro</span></header>
    {!teacherUnlocked ? <section className="access-card"><div className="eyebrow">Acceso docente</div><h1>Administra tus actividades</h1><p>Usa tu clave para editar imágenes y etiquetas o revisar resultados.</p><label>Clave del maestro<input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void unlockTeacher()} placeholder="Escribe tu clave" autoComplete="current-password" /></label><button className="primary" onClick={() => void unlockTeacher()}>Entrar</button>{notice && <p className="notice error">{notice}</p>}</section> : <>
      <nav className="teacher-tabs"><button className={modeTab === "edit" ? "active" : ""} onClick={() => setModeTab("edit")}>Actividades</button><button className={modeTab === "students" ? "active" : ""} onClick={() => { setModeTab("students"); setNotice(""); void loadStudents(); }}>Alumnos</button><button className={modeTab === "results" ? "active" : ""} onClick={() => { setModeTab("results"); void loadResults(); }}>Resultados</button><a className="quiet" href="?panel=actividades">Mis actividades</a><button className="quiet" onClick={() => { setTeacherUnlocked(false); setTeacherKey(""); setKeyDraft(""); forgetTeacherKey(); }}>Salir</button></nav>
      {modeTab === "edit" ? <section className="editor-layout"><div className="editor-main"><div className="editor-heading"><div><div className="eyebrow">Editor reutilizable</div><h1>Prepara una actividad</h1></div><button className="secondary" onClick={addNewActivity}>＋ Nueva actividad</button></div><div className="editor-controls"><label>Actividad guardada<select value={activities.some((a) => a.id === editing.id) ? editing.id : ""} onChange={(e) => e.target.value && void selectActivity(e.target.value)}><option value="">Actividad nueva</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label><div className="step-heading"><b>1</b><strong>Sube la imagen</strong><span>Primero elige el recurso visual.</span></div><label className="upload-label">Imagen del tema<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void handleImage(e.target.files?.[0])} /><span>PNG, JPG o WebP · máximo 5 MB</span></label><div className="step-heading"><b>2</b><strong>Escribe las etiquetas</strong><span>Agrega hasta 10 palabras y elige sus colores.</span></div><label>Título<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Ej. Partes del aparato digestivo" /></label><div className="fixed-instructions"><strong>Instrucción del juego</strong><span>Arrastra y suelta las chinchetas en su lugar correcto de la imagen.</span></div><div className="split-controls"><label>Reloj<select value={editing.timerMode} onChange={(e) => setEditing({ ...editing, timerMode: e.target.value as Activity["timerMode"] })}><option value="none">Sin límite</option><option value="up">Contar el tiempo</option><option value="down">Cuenta regresiva</option></select></label><label>Intentos permitidos<select value={editing.maxAttempts === null ? "unlimited" : String(editing.maxAttempts ?? 3)} onChange={(e) => setEditing({ ...editing, maxAttempts: e.target.value === "unlimited" ? null : Number(e.target.value) })}><option value="unlimited">Ilimitados</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} intento{i ? "s" : ""}</option>)}</select></label>{editing.timerMode === "down" && <label>Minutos<input type="number" min="1" max="60" value={Math.round(editing.timeLimitSeconds / 60)} onChange={(e) => setEditing({ ...editing, timeLimitSeconds: Math.max(60, Number(e.target.value) * 60) })} /></label>}</div></div><div className="label-editor"><div className="label-editor-heading"><div><h2>3. Coloca las etiquetas en la imagen</h2><p>Arrastra el botón de ubicación hasta el punto correcto. En celular, selecciónalo y toca la imagen.</p></div><span>{editing.labels.length}/10</span></div><div className="label-list">{editing.labels.map((label) => <div className={`label-row ${activeLabel === label.id ? "chosen" : ""}`} key={label.id}><button className="color-dot" style={{ background: label.color }} onClick={() => setActiveLabel(label.id)} aria-label={`Seleccionar ${label.text || "etiqueta"}`} /><input value={label.text} onFocus={() => setActiveLabel(label.id)} onChange={(e) => setEditorLabel(label.id, { text: e.target.value })} placeholder={`Etiqueta ${editing.labels.indexOf(label) + 1}`} /><input className="color-input" type="color" value={label.color} onChange={(e) => setEditorLabel(label.id, { color: e.target.value })} aria-label="Color de etiqueta" /><button className="small-button" draggable onDragStart={(e) => { e.dataTransfer.setData("text/label-id", label.id); setActiveLabel(label.id); }} onClick={() => setActiveLabel(label.id)}>{activeLabel === label.id ? "Llévame a la imagen" : `${Math.round(label.x)}%, ${Math.round(label.y)}%`}</button><button className="remove-button" onClick={() => setEditing({ ...editing, labels: editing.labels.filter((l) => l.id !== label.id) })} aria-label="Eliminar etiqueta">×</button></div>)}</div>{editing.labels.length < 10 && <button className="add-label" onClick={addLabel}>＋ Añadir etiqueta</button>}</div><div className="save-row"><button className="primary" disabled={busy} onClick={() => void saveActivity()}>{busy ? "Guardando…" : "Guardar actividad"}</button>{notice && <p className={notice.startsWith("Actividad guardada") ? "notice success" : "notice error"}>{notice}</p>}</div>{shareLink && <div className="share-card"><div><strong>Enlace para tus alumnos</strong><span>{shareLink}</span></div><button className="secondary" onClick={async () => { await navigator.clipboard.writeText(shareLink); setCopied(true); }}> {copied ? "Copiado" : "Copiar enlace"}</button></div>}</div>
      <aside className="editor-preview"><div className="preview-kicker">3 · Ubica cada respuesta</div><div className="preview-title">{editing.title || "Título de la actividad"}</div><div className="editor-stage" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/label-id") || activeLabel; if (!id) return; const r = e.currentTarget.getBoundingClientRect(); setEditorLabel(id, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); setActiveLabel(id); }} onClick={(e) => { if (!activeLabel) { setNotice("Selecciona primero una etiqueta."); return; } const r = e.currentTarget.getBoundingClientRect(); setEditorLabel(activeLabel, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}><img src={editorImage} alt="Vista previa del dibujo" />{editing.labels.map((label) => <span className="target-dot editing-dot" key={label.id} style={{ left: `${label.x}%`, top: `${label.y}%`, borderColor: label.color }} title={label.text} />)}</div><p className="preview-help">{activeLabel ? "Toca el lugar de la imagen donde va la etiqueta seleccionada." : "Selecciona una etiqueta para marcar su punto."}</p></aside></section> : modeTab === "results" ? <section className="results-section"><div className="results-heading"><div><div className="eyebrow">Seguimiento</div><h1>Resultados de los alumnos</h1><p>{attempts.length} participaciones registradas</p></div><button className="secondary" onClick={exportCSV}>Descargar hoja CSV</button></div><div className="table-wrap"><table><thead><tr><th>Alumno</th><th>Actividad</th><th>Aciertos</th><th>Calificación</th><th>Tiempo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{attempts.map((a) => <tr key={a.id}><td>{a.paternal_surname} {a.maternal_surname}, {a.given_names}</td><td>{activities.find((v) => v.id === a.activity_id)?.title || a.activity_id}</td><td>{a.correct}/{a.total}</td><td><strong>{Number(a.grade).toFixed(1)}</strong></td><td>{fmt(a.elapsed_seconds)}{a.remaining_seconds !== null ? ` · sobró ${fmt(a.remaining_seconds)}` : ""}</td><td>{a.timed_out ? "Tiempo agotado" : "Terminado"}</td><td>{new Date(a.submitted_at).toLocaleString("es-MX")}</td></tr>)}</tbody></table>{attempts.length === 0 && <div className="empty-state">Todavía no hay participaciones guardadas.</div>}</div></section> : studentManagement}
    </>}
  </main>;

  if (screen === "result") return <main className="page result-page"><header className="topbar"><a className="brand" href="./"><span className="brand-mark">10</span><span>Diagrama con etiquetas</span></a></header><section className="result-card"><div className="result-orbit">{result?.correct ?? 0}<small>de {result?.total ?? activity.labels.length}</small></div><div className="eyebrow">Actividad terminada</div><h1>{result?.grade.toFixed(1)} <span>/ 10</span></h1><p>{student.givenNames}, revisa tus resultados con tu maestro.</p><div className="result-stats"><div><span>Aciertos</span><strong>{result?.correct}/{result?.total}</strong></div><div><span>Tiempo realizado</span><strong>{fmt(result?.elapsedSeconds ?? seconds)}</strong></div><div><span>{result?.timedOut ? "Estado" : result?.remainingSeconds !== null ? "Tiempo restante" : "Estado"}</span><strong>{result?.timedOut ? "Se agotó" : result?.remainingSeconds !== null ? fmt(result?.remainingSeconds ?? 0) : "Completado"}</strong></div></div><div className={`attempts-notice ${(result?.attemptsRemaining ?? 0) > 0 || result?.attemptsRemaining === null ? "available" : "used"}`}>{result?.attemptsRemaining === null ? "Puedes volver a intentarlo cuando quieras." : result?.attemptsRemaining === 1 ? "Te queda 1 intento." : result?.attemptsRemaining && result.attemptsRemaining > 1 ? `Te quedan ${result.attemptsRemaining} intentos.` : "Ya utilizaste todos tus intentos."}</div><div className="result-actions">{result && (result.attemptsRemaining === null || result.attemptsRemaining > 0) && <button className="primary" onClick={retryGame}>Intentar de nuevo</button>}<button className="secondary" onClick={() => { setStudent(emptyStudent); setStudentToken(""); setStudentCredentials({ username: "", password: "" }); setPlacements({}); setSeconds(0); setResult(null); setScreen("catalog"); }}>Volver a los juegos</button></div></section><section className="leaderboard-section"><div className="leaderboard-heading"><div className="eyebrow">Clasificación</div><h2>Tabla de posiciones</h2><p>Ordenada por aciertos y después por menor tiempo.</p></div>{leaderboard.length ? <ol className="leaderboard-list">{leaderboard.map((item) => <li key={item.rank} className={`leader-row ${item.rank <= 7 ? `rank-special rank-${item.rank}` : "rank-standard"}`}><span className="rank-badge">{item.rank <= 7 ? ["🥇", "🥈", "🥉", "🏅", "🌟", "🎖️", "🏆"][item.rank - 1] : item.rank}</span><span className="leader-name">{item.name} {item.paternalSurname}</span><span className="leader-score">{item.correct}/{item.total}</span><span className="leader-time">{fmt(item.elapsedSeconds)}</span></li>)}</ol> : <p className="empty-state">Aún no hay posiciones registradas.</p>}</section></main>;

  return <main className={`page game-page ${screen === "play" ? "is-playing" : ""}`}><header className="topbar"><a className="brand" href="./"><span className="brand-mark">10</span><span>Diagrama con etiquetas</span></a><div className="top-actions"><a className="teacher-link catalog-return" href="./">Todos los juegos</a><button className={`sound-toggle ${muted ? "is-muted" : ""}`} onClick={() => setMuted(!muted)} aria-label={muted ? "Activar sonidos" : "Silenciar sonidos"}>{muted ? "Sonido apagado" : "Sonido activado"}</button><a className="teacher-link" href="?panel=actividades">Mis actividades</a></div></header>
    {screen === "intro" ? <section className="intro-layout"><div className="intro-copy"><div className="eyebrow">Ciencias · 4.º grado</div><h1>{activity.title}</h1><p className="instructions">{activity.instructions}</p><div className="timer-note">{activity.timerMode === "down" ? `Cuenta regresiva: ${fmt(activity.timeLimitSeconds)}` : activity.timerMode === "up" ? "El reloj contará cuánto tardas." : "Sin límite de tiempo."}</div><form className="student-form" onSubmit={(e) => { e.preventDefault(); void loginStudent(); }}><div className="form-title">Entra con tu usuario y contraseña</div><label>Usuario<input required value={studentCredentials.username} onChange={(e) => setStudentCredentials({ ...studentCredentials, username: e.target.value })} autoComplete="username" /></label><label>Contraseña<input required type="password" value={studentCredentials.password} onChange={(e) => setStudentCredentials({ ...studentCredentials, password: e.target.value })} autoComplete="current-password" /></label>{notice && <p className="notice error">{notice}</p>}<button className="primary start-button" type="submit" disabled={busy}>{busy ? "Verificando cuenta…" : "Entrar y comenzar"}</button><button className="text-button" type="button" onClick={() => setShowLeaderboard(!showLeaderboard)}>Tabla de posiciones {showLeaderboard ? "▲" : "▼"}</button>{showLeaderboard && <div className="leaderboard-list intro-ranking">{leaderboard.map((item) => <div key={item.rank} className={`leader-row ${item.rank <= 7 ? `rank-special rank-${item.rank}` : "rank-standard"}`}><span className="rank-badge">{item.rank <= 7 ? ["🥇", "🥈", "🥉", "🏅", "🌟", "🎖️", "🏆"][item.rank - 1] : item.rank}</span><span className="leader-name">{item.name} {item.paternalSurname}</span><span className="leader-score">{item.correct}/{item.total}</span><span className="leader-time">{fmt(item.elapsedSeconds)}</span></div>)}</div>}</form></div><div className="intro-art"><img src={activity.imageUrl} alt="Ilustración del aparato digestivo"/><div className="art-caption"><span>10 etiquetas</span><span>Arrastra y une</span></div></div></section> : <section className="play-area"><div className="play-heading"><div><div className="eyebrow">{activity.title}</div><p>{activity.instructions}</p></div><div className={`timer ${remaining !== null && remaining < 20 ? "urgent" : ""}`}><span>{activity.timerMode === "down" ? "Te queda" : activity.timerMode === "up" ? "Tiempo" : "Listo"}</span><strong>{activity.timerMode === "none" ? "∞" : clockText}</strong></div></div><div className="play-progress"><span>{placedCount} de {activity.labels.length} etiquetas colocadas</span><button className="text-button" onClick={() => setMuted(!muted)}>{muted ? "Activar sonidos" : "Silenciar sonidos"}</button></div><div className="board" ref={boardRef}><svg className="connector-layer" aria-hidden="true">{lines.map((line) => <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} strokeWidth="3" strokeLinecap="round" />)}</svg><div className="game-stage" ref={stageRef}><img src={activity.imageUrl} alt="Ilustración para señalar las partes" draggable={false}/>{activity.labels.map((label) => { const placedAt = Object.entries(placements).find(([, targetId]) => targetId === label.id); return <span key={label.id} className={`target-dot ${placedAt ? "occupied" : ""}`} style={{ left: `${label.x}%`, top: `${label.y}%`, borderColor: placedAt ? activity.labels.find((item) => item.id === placedAt[0])?.color : undefined }} aria-label="Punto para unir etiqueta" />; })}</div><div className="tag-tray">{playLabels.map((label, i) => <button key={label.id} ref={(el) => { chipsRef.current[label.id] = el; }} className={`tag-chip ${selected === label.id ? "selected" : ""} ${placements[label.id] ? "placed" : ""}`} style={{ "--tag-color": label.color } as React.CSSProperties} onClick={() => setSelected(label.id)} onPointerDown={(e) => beginDrag(e, label)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} aria-label={`Arrastrar etiqueta ${label.text}`}><span className="tag-index">{i + 1}</span><span>{label.text}</span>{placements[label.id] && <span className="placed-mark">●</span>}</button>)}</div></div>{selected && <div className="selected-readout"><span>Etiqueta seleccionada</span><strong style={{ color: activity.labels.find((l) => l.id === selected)?.color }}>{activity.labels.find((l) => l.id === selected)?.text}</strong><small>En celular, tócala y arrástrala al punto.</small></div>}<div className="play-footer"><button className="primary" disabled={busy} onClick={() => void submit(false)}>{busy ? "Guardando…" : "Terminar y enviar"}</button><span>Las etiquetas se pueden mover otra vez antes de enviar.</span></div>{notice && <p className="notice error center-notice">{notice}</p>}{drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y, "--tag-color": activity.labels.find((l) => l.id === drag.id)?.color || "#2684e8" } as React.CSSProperties}>{activity.labels.find((l) => l.id === drag.id)?.text}</div>}</section>}
  </main>;
}

