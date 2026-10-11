import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Activity, FormativeField } from "./default-activity";
import { imageFileToDataUrl } from "./image-utils";
import { clearActivityDrafts, deleteActivityDraft, readActivityDraft, writeActivityDraft } from "./activity-drafts";
import "./activity-settings.css";

const fields: { value: FormativeField; label: string }[] = [
  { value: "lenguajes", label: "Lenguajes" },
  { value: "saberes", label: "Saberes y pensamiento científico" },
  { value: "etica", label: "Ética, naturaleza y sociedades" },
  { value: "humano", label: "De lo humano y lo comunitario" },
];

function localValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function isoValue(value: string) { return value ? new Date(value).toISOString() : null; }

export default function ActivitySettings({ value, onChange, title = "Configuración de actividad", includeCoreControls = true, includeCoverImage = true, enableDraftAutosave = false }: {
  value: Activity;
  onChange: Dispatch<SetStateAction<Activity>>;
  title?: string;
  includeCoreControls?: boolean;
  includeCoverImage?: boolean;
  enableDraftAutosave?: boolean;
}) {
  const activityKind = value.kind || "quiz";
  const draftKey = `${activityKind}:${value.id || "new"}`;
  const initialValue = useRef(value);
  const latestValue = useRef(value);
  const readyToSave = useRef(false);
  const activeDraftKey = useRef(draftKey);
  const [draftMessage, setDraftMessage] = useState("Al editar, los cambios se guardarán automáticamente como borrador en este navegador.");
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  latestValue.current = value;

  useEffect(() => {
    if (!enableDraftAutosave) { readyToSave.current = false; return; }
    let cancelled = false;
    const startingValue = latestValue.current;
    initialValue.current = startingValue;
    readyToSave.current = false;
    const previousKey = activeDraftKey.current;
    activeDraftKey.current = draftKey;
    if (previousKey !== draftKey && previousKey.endsWith(":new")) void deleteActivityDraft(previousKey).catch(() => {});
    setDraftSavedAt(null);
    setDraftState("idle");
    setDraftMessage("Al editar, los cambios se guardarán automáticamente como borrador en este navegador.");

    void readActivityDraft(draftKey).then(async record => {
      if (cancelled) return;
      readyToSave.current = true;
      if (!record) return;
      if (JSON.stringify(record.activity) === JSON.stringify(startingValue)) {
        await deleteActivityDraft(draftKey).catch(() => {});
        return;
      }
      if (latestValue.current === startingValue) {
        onChange(record.activity);
        setDraftSavedAt(record.savedAt);
        setDraftState("saved");
        setDraftMessage("Se recuperó un borrador guardado en este navegador. Puedes seguir editándolo.");
      }
    }).catch(error => {
      if (cancelled) return;
      readyToSave.current = true;
      setDraftState("error");
      setDraftMessage(error instanceof Error ? error.message : "No se pudo revisar el borrador local.");
    });

    const handleSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; id?: string }>).detail;
      if (detail?.kind !== activityKind || (value.id && detail.id && detail.id !== value.id)) return;
      void clearActivityDrafts(activityKind, detail.id || value.id || "").catch(() => {});
      setDraftState("idle");
      setDraftSavedAt(null);
      setDraftMessage("Actividad guardada. Ya aparece en Mis actividades como borrador hasta que la publiques o programes.");
    };
    window.addEventListener("aula-activity-saved", handleSaved);
    return () => {
      cancelled = true;
      window.removeEventListener("aula-activity-saved", handleSaved);
    };
  }, [draftKey, enableDraftAutosave]);

  useEffect(() => {
    if (!enableDraftAutosave || !readyToSave.current || value === initialValue.current) return;
    setDraftState("saving");
    setDraftMessage("Guardando los cambios automáticamente como borrador en este navegador…");
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void writeActivityDraft(draftKey, value).then(savedAt => {
        if (cancelled) return;
        setDraftSavedAt(savedAt);
        setDraftState("saved");
        setDraftMessage("Borrador guardado automáticamente en este navegador. Al volver, podrás continuar desde aquí.");
      }).catch(error => {
        if (cancelled) return;
        setDraftState("error");
        setDraftMessage(error instanceof Error ? error.message : "No se pudo guardar el borrador automáticamente.");
      });
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [draftKey, value, enableDraftAutosave]);

  const patch = (updates: Partial<Activity>) => onChange(current => ({ ...current, ...updates }));
  const fallbackShuffle = value.shuffle !== false;
  const selectedField = fields.find(field => field.value === value.fieldFormative)?.label || "Campo formativo sin seleccionar";
  const clockLabel = value.timerMode === "down" ? "Cuenta regresiva" : value.timerMode === "up" ? "Cronómetro" : "Sin límite de tiempo";
  const coverPreview = value.coverImageData || value.coverImageUrl;
  async function uploadCover(file?: File) {
    if (!file) return;
    try { patch({ coverImageData: await imageFileToDataUrl(file) }); }
    catch (error) { window.alert(error instanceof Error ? error.message : "No se pudo leer la imagen."); }
  }
  return <>
  <details className="shared-settings">
    <summary><strong>{title}</strong><span>{selectedField} · {clockLabel}</span></summary>
    <div className="shared-settings-content">
    {includeCoverImage && <div className="activity-cover-setting">
      <div><strong>Portada de la actividad</strong><small>Esta imagen aparecerá en el panel del alumno y en el del maestro.</small></div>
      {coverPreview && <img src={coverPreview} alt="Vista previa de la portada"/>}
      <label className="activity-cover-upload">{coverPreview ? "Cambiar imagen" : "＋ Subir imagen"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{void uploadCover(event.currentTarget.files?.[0]);event.currentTarget.value=""}}/></label>
    </div>}
    <div className="shared-settings-grid">
      <label>Campo formativo<select value={value.fieldFormative || ""} onChange={event => patch({ fieldFormative: event.target.value as FormativeField | "" })}>
        <option value="">Selecciona un campo formativo</option>{fields.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
      </select></label>
      <label>Activar desde<input type="datetime-local" value={localValue(value.availableFrom)} onChange={event => patch({ availableFrom: isoValue(event.target.value) })}/><small>Déjalo vacío para activarla ahora.</small></label>
      <label>Disponible hasta<input type="datetime-local" value={localValue(value.availableUntil)} onChange={event => patch({ availableUntil: isoValue(event.target.value) })}/><small>Déjalo vacío para no poner fecha de cierre.</small></label>
      {includeCoreControls && <><label>Reloj<select value={value.timerMode} onChange={event => patch({ timerMode: event.target.value as Activity["timerMode"] })}><option value="none">Sin límite</option><option value="up">Contar el tiempo</option><option value="down">Cuenta regresiva</option></select></label>
      {value.timerMode === "down" && <label>Duración (minutos)<input type="number" min="1" max="60" value={Math.max(1, Math.round(value.timeLimitSeconds / 60))} onChange={event => patch({ timeLimitSeconds: Math.max(60, Number(event.target.value) * 60) })}/></label>}
      <label>Intentos<select value={value.maxAttempts === null ? "infinite" : String(value.maxAttempts ?? 3)} onChange={event => patch({ maxAttempts: event.target.value === "infinite" ? null : Number(event.target.value) })}><option value="infinite">Ilimitados</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label></>}
    </div>
    <div className="shared-settings-groups">
      <fieldset><legend>Maestría</legend>
        <label><input type="checkbox" checked={value.showAnswersAtEnd === true} onChange={event => patch({ showAnswersAtEnd: event.target.checked })}/> Mostrar respuestas al final</label>
        <label><input type="checkbox" checked={value.showLeaderboard === true} onChange={event => patch({ showLeaderboard: event.target.checked })}/> Mostrar tabla de posiciones al terminar</label>
      </fieldset>
      <fieldset><legend>Anti-trampas</legend>
        <label><input type="checkbox" checked={value.shuffleQuestions ?? fallbackShuffle} onChange={event => patch({ shuffleQuestions: event.target.checked })}/> Barajar el orden de las preguntas</label>
        <label><input type="checkbox" checked={value.shuffleAnswers ?? fallbackShuffle} onChange={event => patch({ shuffleAnswers: event.target.checked })}/> Barajar el orden de las respuestas</label>
        <label><input type="checkbox" checked={value.blurWhenInactive === true} onChange={event => patch({ blurWhenInactive: event.target.checked })}/> Difuminar la actividad al cambiar de pestaña</label>
      </fieldset>
      <fieldset><legend>Otros</legend>
        <label><input type="checkbox" checked={value.sound !== false} onChange={event => patch({ sound: event.target.checked })}/> Sonidos</label>
      </fieldset>
    </div>
    <p className="shared-settings-note">La actividad guardada permanecerá como borrador hasta que la publiques o programes desde <b>Mis actividades</b>.</p>
    </div>
  </details>
  {enableDraftAutosave && <div className={`activity-draft-status is-${draftState}`} role="status" aria-live="polite">
    <span className="activity-draft-status-icon" aria-hidden="true">{draftState === "saving" ? "…" : draftState === "error" ? "!" : "✓"}</span>
    <div><strong>{draftState === "saving" ? "Guardando borrador" : draftState === "saved" ? "Borrador automático" : draftState === "error" ? "No se guardó el borrador" : "Borrador de actividad"}</strong>
      <small>{draftSavedAt && draftState === "saved" ? `${draftMessage} · ${new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(draftSavedAt)}` : draftMessage}</small>
    </div>
  </div>}
  </>;
}
