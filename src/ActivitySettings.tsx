import type { Dispatch, SetStateAction } from "react";
import type { Activity, FormativeField } from "./default-activity";
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

export default function ActivitySettings({ value, onChange, title = "Configuración de actividad", includeCoreControls = true }: {
  value: Activity;
  onChange: Dispatch<SetStateAction<Activity>>;
  title?: string;
  includeCoreControls?: boolean;
}) {
  const patch = (updates: Partial<Activity>) => onChange(current => ({ ...current, ...updates }));
  const fallbackShuffle = value.shuffle !== false;
  return <section className="shared-settings">
    <h2>{title}</h2>
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
    <p className="shared-settings-note">La actividad se guarda como borrador. Asígnala o actívala para tus alumnos desde <b>Mis actividades</b>.</p>
  </section>;
}
