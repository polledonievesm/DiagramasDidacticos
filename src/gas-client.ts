Warning: truncated output (original token count: 5303)
Total output lines: 334

import type { Activity } from "./default-activity";

type ApiResult = Record<string, unknown>;
let cachedActivities = new Map<string, Activity>();
let cachedActivity: Activity | null = null;
const teacherKeyNames = ["platformTeacherKey", "pairTeacherKey", "diagramTeacherKey"] as const;
const TEACHER_USERNAME_KEY = "aulaTeacherUsername";
const STUDENT_SESSION_KEY = "aulaStudentSessionV1";
export type StudentSessionProfile = { id:string; name?:string; givenNames:string; paternalSurname:string; maternalSurname:string; username:string };

export function getStudentSession() {
  try { return JSON.parse(sessionStorage.getItem(STUDENT_SESSION_KEY) || "null") as { token: string; student: StudentSessionProfile } | null; }
  catch { return null; }
}
export function saveStudentSession(token: string, student: StudentSessionProfile) {
  const normalized = { ...student, givenNames: student.givenNames || student.name || "" };
  sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({ token, student: normalized }));
}
export function clearStudentSession() { sessionStorage.removeItem(STUDENT_SESSION_KEY); }

export function getTeacherKey() {
  for (const name of teacherKeyNames) {
    const persistent = localStorage.getItem(name);
    if (persistent) return persistent;
    const sessionValue = sessionStorage.getItem(name);
    if (sessionValue) {
      rememberTeacherKey(sessionValue);
      return sessionValue;
    }
  }
  return "";
}

export function rememberTeacherKey(value: string, username = "") {
  teacherKeyNames.forEach(name => {
    localStorage.setItem(name, value);
    sessionStorage.setItem(name, value);
  });
  if (username) localStorage.setItem(TEACHER_USERNAME_KEY, username);
}

export function getTeacherUsername() {
  const username = localStorage.getItem(TEACHER_USERNAME_KEY)?.trim();
  // «maestra» is the legacy sign-in ID; show Michel's preferred account name in the interface.
  return !username || username.toLocaleLowerCase("es-MX") === "maestra" ? "michelotaner" : username;
}

export function forgetTeacherKey() {
  teacherKeyNames.forEach(name => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  });
  localStorage.removeItem(TEACHER_USERNAME_KEY);
}

export async function logoutTeacher() {
  const token = getTeacherKey();
  forgetTeacherKey();
  if (token) {
    try { await apiRequest("/api/teacher/logout", { method: "POST", body: JSON.stringify({ token }) }); }
    catch { /* La sesión local se cierra aunque se pierda la conexión. */ }
  }
}

function endpoint() {
  const value = window.GAS_WEB_APP_URL?.trim();
  if (!value || value.includes("PEGA_AQUI")) throw new Error("Falta configurar la URL de Apps Script en config.js.");
  return value;
}

function jsonp<T>(params: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = `gasCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => finish(new Error("El servidor tardó demasiado en responder.")), 20000);
    const finish = (error?: Error, data?: T) => {
      window.clearTimeout(timer);
      script.remove();
      delete (window as unknown as Record<string, unknown>)[callback];
      error ? reject(error) : resolve(data as T);
    };
    (window as unknown as Record<string, unknown>)[callback] = (data: T) => finish(undefined, data);
    const query = new URLSearchParams({ ...params, callback });
    script.onerror = () => finish(new Error("No se pudo conectar con Apps Script."));
    script.src = `${endpoint()}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

async function send(payload: Record<string, unknown>) {
  // Apps Script no admite CORS preflight. text/plain evita OPTIONS; la respuesta
  // es opaca, por eso las lecturas usan JSONP y las escrituras se verifican después.
  await fetch(endpoint(), {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

function response(data: ApiResult, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async (): Promise<any> => data };
}

export async function apiRequest(path: string, init: RequestInit = {}) {
  const url = new URL(path, window.location.href);
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};

  if (method === "GET" && url.pathname.endsWith("/api/capabilities")) {
    const data = await jsonp<ApiResult>({ action: "capabilities" });
    return response(data, typeof data.apiVersion === "number" ? 200 : 404);
  }
  if (method === "GET" && url.pathname.endsWith("/api/student/portal")) {
    const token = url.searchParams.get("studentToken") || "";
    const data = await jsonp<ApiResult>({ action: "studentPortal", studentToken: token });
    return response(data, "error" in data ? 401 : 200);
  }
  if (method === "GET" && url.pathname.endsWith("/api/activity")) {
    const data = await jsonp<Activity>({ action: "activity", id: url.searchParams.get("id") || "" });
    if (data && !("error" in (data as object))) {
      cachedActivity = data;
      cachedActivities.set(data.id, data);
      return response(data as unknown as ApiResult);
    }
    return response(data as unknown as ApiResult, 404);
  }
  if (method === "GET" && url.pathname.endsWith("/api/pair-activities")) {
    const data = await jsonp<Activity[]>({ action: "pairActivities" });
    return response(data as unknown as ApiResult);
  }
  if (method === "GET" && url.pathname.endsWith("/api/attempts")) {
    const data = await jsonp<ApiResult>({
      action: "attempts",
      activityId: url.searchParams.get("activityId") || "digestivo-inicial",
      paternalSurname: url.searchParams.get("paternalSurname") || "",
      maternalSurname: url.searchParams.get("maternalSurname") || "",
      givenNames: url.searchParams.get("givenNames") || "",
      studentToken: url.searchParams.get("studentToken") || "",
    });
    return response(data, "error" in data ? 400 : 200);
  }
  if (method === "GET" && url.pathname.endsWith("/api/leaderboard")) {
    const data = await jsonp<ApiResult | ApiResult[]>({ action: "leaderboard", activityId: url.searchParams.get("activityId") || "digestivo-inicial" });
    return response(data as ApiResult, Array.isArray(data) ? 200 : 404);
  }
  if (method === "GET" && url.pathname.endsWith("/api/teacher/activities")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    const data = await jsonp<Activity[] | ApiResult>({ action: "activities", key });
    if (!Array.isArray(data)) return response(data as ApiResult, 401);
    data.forEach((item) => cachedActivities.set(item.id, item));
    const type = url.searchParams.get("tipo");
    const filtered = type === "all" ? data : type === "pairs" ? data.filter((item) => item.kind === "pairs") : data.filter((item) => item.kind !== "pairs");
    return response(filtered as unknown as ApiResult);
  }
  if (method === "GET" && url.pathname.endsWith("/api/teacher/results")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    const data = await jsonp<ApiResult[] | ApiResult>({ action: "results", key });
    return response(data as unknown as ApiResult, Array.isArray(data) ? 200 : 401);
  }
  if (method === "GET" && url.pathname.endsWith("/api/teacher/students")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    const data = await jsonp<ApiResult[] | ApiResult>({ action: "students", key });
    return response(data as unknown as ApiResult, Array.isArray(data) ? 200 : 401);
  }
  if (method === "POST" && url.pathname.endsWith("/api/student/login")) {
    const requestId = crypto.randomUUID();
    await send({ action: "studentLogin", requestId, username: String(body.username || ""), password: String(body.password || "") });
 …1303 tokens truncated…" }, 503);
    return response(data);
  }
  if (method === "POST" && url.pathname.endsWith("/api/teacher/activity-design")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    await send({ ...body, action: "setActivityDesign", key });
    const loaded = await jsonp<ApiResult>({ action: "activity", id: String(body.id || "") });
    if ("error" in loaded) return response(loaded, 404);
    if (String(loaded.cardTheme || "mint") !== String(body.theme || "mint")) return response({ error: "No se pudo verificar el diseño guardado." }, 503);
    if (body.imageData && !loaded.coverImageUrl) return response({ error: "No se pudo confirmar la imagen de portada." }, 503);
    return response({ id: loaded.id, coverImageUrl: loaded.coverImageUrl || loaded.imageUrl || "", cardTheme: loaded.cardTheme || "mint" });
  }
  if (method === "POST" && url.pathname.endsWith("/api/submit")) {
    const id = String(body.activityId || "digestivo-inicial");
    const activity = cachedActivities.get(id) || cachedActivity;
    if (!activity) return response({ error: "No se encontró la actividad." }, 404);
    const availability = await jsonp<ApiResult>({ action: "attempts", activityId: id, paternalSurname: String(body.paternalSurname || ""), maternalSurname: String(body.maternalSurname || ""), givenNames: String(body.givenNames || ""), studentToken: String(body.studentToken || "") });
    if ("error" in availability) return response(availability, 400);
    if (!availability.canStart) return response({ error: "Ya utilizaste todos tus intentos para esta actividad." }, 429);
    const placements = (body.placements || {}) as Record<string, string>;
    const matches = (body.matches || {}) as Record<string, string>;
    const answers = (body.answers || {}) as Record<string, unknown>;
    let correct = 0;
    if (activity.kind === "quiz" || activity.kind === "quiz-show" || activity.kind === "true-false") correct = (activity.questions || []).filter((question) => answers[question.id] === question.correctOptionId).length;
    else if (activity.kind === "group-sort") correct = (activity.items || []).filter((item) => answers[item.id] === item.groupId).length;
    else if (activity.kind === "sequence") {
      const submitted = Array.isArray(answers.order) ? answers.order.map(String) : [];
      correct = [...(activity.steps || [])].sort((a, b) => a.order - b.order).filter((step, index) => submitted[index] === step.id).length;
    } else if (activity.kind === "complete-sentence" || activity.kind === "complete-phrase") {
      const normalizeAnswer = (value: unknown) => String(value || "").trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\\s+/g, " ");
      correct = (activity.sentences || []).filter((sentence) => normalizeAnswer(answers[sentence.id]) === normalizeAnswer(sentence.answer)).length;
    } else if (activity.kind === "word-order") {
      (activity.wordSentences || []).forEach((sentence) => {
        const submitted = String(answers[sentence.id] || "").split("|");
        const expected = [...(sentence.words || [])].sort((a, b) => a.order - b.order);
        correct += expected.filter((word, index) => submitted[index] === word.id).length;
      });
    } else if (activity.kind === "flashcards" || activity.kind === "memory") correct = (activity.pairs || []).filter((pair) => answers[pair.id] === pair.id).length;
    else if (activity.kind === "pairs") correct = (activity.pairs || []).filter((pair) => matches[pair.id] === pair.id).length;
    else if (activity.kind === "roulette") { const ids = new Set(Array.isArray(answers.completedIds) ? (answers.completedIds as unknown[]).map(String) : []); correct = (activity.wheelEntries || []).filter((entry) => ids.has(entry.id)).length; }
    else if (activity.kind === "word-search") { const normalizeWord = (word: string) => word.toLocaleUpperCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-ZÑ]/g, ""); const found = new Set(Array.isArray(answers.foundWords) ? (answers.foundWords as unknown[]).map((word) => normalizeWord(String(word))) : []); correct = (activity.wordSearchWords || []).filter((word) => found.has(normalizeWord(word))).length; }
    else correct = activity.labels.filter((label) => placements[label.id] === label.id).length;
    const total = activity.kind === "pairs" || activity.kind === "flashcards" || activity.kind === "memory" ? (activity.pairs || []).length : activity.kind === "quiz" || activity.kind === "quiz-show" || activity.kind === "true-false" ? (activity.questions || []).length : activity.kind === "group-sort" ? (activity.items || []).length : activity.kind === "sequence" ? (activity.steps || []).length : activity.kind === "complete-sentence" || activity.kind === "complete-phrase" ? (activity.sentences || []).length : activity.kind === "word-order" ? (activity.wordSentences || []).reduce((sum, sentence) => sum + (sentence.words || []).length, 0) : activity.kind === "roulette" ? (activity.wheelEntries || []).length : activity.kind === "word-search" ? (activity.wordSearchWords || []).length : activity.labels.length;
    const elapsedSeconds = Number(body.elapsedSeconds) || 0;
    const result = {
      id: Date.now(), correct, total,
      grade: Math.round((correct / Math.max(total, 1)) * 100) / 10,
      elapsedSeconds,
      remainingSeconds: body.remainingSeconds === null ? null : Number(body.remainingSeconds) || 0,
      timedOut: Boolean(body.timedOut),
    };
    await send({ action: "submit", ...body });
    const after = await jsonp<ApiResult>({ action: "attempts", activityId: id, paternalSurname: String(body.paternalSurname || ""), maternalSurname: String(body.maternalSurname || ""), givenNames: String(body.givenNames || ""), studentToken: String(body.studentToken || "") });
    if ("error" in after) return response(after, 400);
    if (Number(after.used) <= Number(availability.used)) return response({ error: "No se pudo registrar el intento. Vuelve a intentarlo." }, 503);
    return response({ ...result, attemptsUsed: Number(after.used), attemptsRemaining: after.remaining as number | null, maxAttempts: after.maxAttempts as number | null });
  }
  if (method === "POST" && url.pathname.endsWith("/api/teacher/activity")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    const saved = { ...body, action: "saveActivity", key };
    await send(saved);
    const id = String(body.id || "");
    // La escritura termina antes de que fetch no-cors resuelva; se relee desde Sheets.
    const data = await jsonp<Activity | ApiResult>({ action: "activity", id });
    if (data && "error" in (data as object)) return response(data as ApiResult, 400);
    const activity = data as Activity;
    cachedActivity = activity;
    cachedActivities.set(activity.id, activity);
    return response(activity as unknown as ApiResult);
  }
  if (method === "POST" && url.pathname.endsWith("/api/teacher/activity-archive")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    const id = String(body.id || "");
    if (!id) return response({ error: "Falta el identificador de la actividad." }, 400);
    await send({ action: "archiveActivity", key, id });
    const data = await jsonp<Activity[] | ApiResult>({ action: "activities", key });
    if (!Array.isArray(data)) return response(data as ApiResult, 401);
    if (data.some((activity) => activity.id === id)) return response({ error: "No se pudo verificar el archivo de la actividad." }, 503);
    cachedActivities.delete(id);
    if (cachedActivity?.id === id) cachedActivity = null;
    return response({ ok: true, id });
  }
  return response({ error: "Operación no reconocida." }, 404);
}

export async function supportsActivityKind(kind: string) {
  try {
    const result = await apiRequest("/api/capabilities");
    const data = await result.json();
    return result.ok && Array.isArray(data.kinds) && data.kinds.includes(kind);
  } catch { return false; }
}
