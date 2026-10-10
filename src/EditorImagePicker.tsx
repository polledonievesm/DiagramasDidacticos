import { useRef, useState } from "react";
import "./editor-components.css";
import { imageFileToDataUrl } from "./image-utils";

type Props = { value?: string | null; onChange: (dataUrl: string) => void; label?: string };

export default function EditorImagePicker({ value, onChange, label = "Añadir imagen" }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function choose(file?: File) {
    setError("");
    if (!file) return;
    setLoading(true);
    try { onChange(await imageFileToDataUrl(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo leer la imagen."); }
    finally { setLoading(false); if (input.current) input.current.value = ""; }
  }
  return <span className="editor-image-picker">
    <input ref={input} className="editor-image-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label={label} onChange={event => choose(event.currentTarget.files?.[0])}/>
    <button type="button" className="editor-image-trigger" disabled={loading} onClick={() => input.current?.click()} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/></svg>
    </button>
    {loading && <small role="status">Preparando imagen…</small>}
    {value && <span className="editor-image-preview"><img src={value} alt="Vista previa"/><button type="button" title="Quitar imagen" aria-label="Quitar imagen" onClick={() => { onChange(""); setError(""); }}>×</button></span>}
    {error && <small className="editor-image-error" role="status">{error}</small>}
  </span>;
}
