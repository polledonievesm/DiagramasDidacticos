import { useRef, useState } from "react";
import "./editor-components.css";

type Props = { value?: string | null; onChange: (dataUrl: string) => void; label?: string };

export default function EditorImagePicker({ value, onChange, label = "Añadir imagen" }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  function choose(file?: File) {
    setError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Máximo 5 MB."); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("Usa PNG, JPG o WebP."); return; }
    const reader = new FileReader();
    reader.onload = () => { onChange(String(reader.result)); if (input.current) input.current.value = ""; };
    reader.onerror = () => setError("No se pudo leer la imagen.");
    reader.readAsDataURL(file);
  }
  return <span className="editor-image-picker">
    <input ref={input} className="editor-image-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label={label} onChange={event => choose(event.currentTarget.files?.[0])}/>
    <button type="button" className="editor-image-trigger" onClick={() => input.current?.click()} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/></svg>
    </button>
    {value && <span className="editor-image-preview"><img src={value} alt="Vista previa"/><button type="button" title="Quitar imagen" aria-label="Quitar imagen" onClick={() => { onChange(""); setError(""); }}>×</button></span>}
    {error && <small className="editor-image-error" role="status">{error}</small>}
  </span>;
}
