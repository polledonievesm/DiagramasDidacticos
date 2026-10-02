import type { Activity } from "./default-activity";

type ApiResult = Record<string, unknown>;
let cachedActivities = new Map<string, Activity>();
let cachedActivity: Activity | null = null;

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

  if (method === "GET" && url.pathname.endsWith("/api/activity")) {
    const data = await jsonp<Activity>({ action: "activity", id: url.searchParams.get("id") || "" });
    if (data && !("error" in (data as object))) {
      cachedActivity = data;
      cachedActivities.set(data.id, data);
      return response(data as unknown as ApiResult);
    }
    return response(data as unknown as ApiResult, 404);
  }
  if (method === "GET" && url.pathname.endsWith("/api/attempts")) {
    const data = await jsonp<ApiResult>({
      action: "attempts",
      activityId: url.searchParams.get("activityId") || "digestivo-inicial",
      paternalSurname: url.searchParams.get("paternalSurname") || "",
      maternalSurname: url.searchParams.get("maternalSurname") || "",
      givenNames: url.searchParams.get("givenNames") || "",
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
    cachedActivities = new Map(data.map((item) => [item.id, item]));
    return response(data as unknown as ApiResult);
  }
  if (method === "GET" && url.pathname.endsWith("/api/teacher/results")) {
    const key = new Headers(init.headers).get("x-teacher-key") || "";
    const data = await jsonp<ApiResult[] | ApiResult>({ action: "results", key });
    return response(data as unknown as ApiResult, Array.isArray(data) ? 200 : 401);
  }
  if (method === "POST" && url.pathname.endsWith("/api/submit")) {
    const id = String(body.activityId || "digestivo-inicial");
    const activity = cachedActivities.get(id) || cachedActivity;
    if (!activity) return response({ error: "No se encontró la actividad." }, 404);
    const availability = await jsonp<ApiResult>({ action: "attempts", activityId: id, paternalSurname: String(body.paternalSurname || ""), maternalSurname: String(body.maternalSurname || ""), givenNames: String(body.givenNames || "") });
    if ("error" in availability) return response(availability, 400);
    if (!availability.canStart) return response({ error: "Ya utilizaste todos tus intentos para esta actividad." }, 429);
    const placements = (body.placements || {}) as Record<string, string>;
    const correct = activity.labels.filter((label) => placements[label.id] === label.id).length;
    const total = activity.labels.length;
    const elapsedSeconds = Number(body.elapsedSeconds) || 0;
    const result = {
      id: Date.now(), correct, total,
      grade: Math.round((correct / Math.max(total, 1)) * 100) / 10,
      elapsedSeconds,
      remainingSeconds: body.remainingSeconds === null ? null : Number(body.remainingSeconds) || 0,
      timedOut: Boolean(body.timedOut),
    };
    await send({ action: "submit", ...body });
    const after = await jsonp<ApiResult>({ action: "attempts", activityId: id, paternalSurname: String(body.paternalSurname || ""), maternalSurname: String(body.maternalSurname || ""), givenNames: String(body.givenNames || "") });
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
  return response({ error: "Operación no reconocida." }, 404);
}
