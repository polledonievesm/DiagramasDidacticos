import { useState } from "react";
import "./editor-components.css";

type Props = { title: string; instructions: string; onTitleChange: (value: string) => void; onInstructionsChange: (value: string) => void };
export default function EditorContentHeader({ title, instructions, onTitleChange, onInstructionsChange }: Props) {
  const [showInstructions, setShowInstructions] = useState(false);
  return <div className="editor-content-header">
    <label className="editor-title-field">Título de la actividad<input required maxLength={120} value={title} onChange={event => onTitleChange(event.target.value)} placeholder="Escribe el título"/></label>
    <button type="button" className="editor-instruction-toggle" onClick={() => setShowInstructions(value => !value)}>{showInstructions ? "−" : "+"} Instrucción</button>
    {showInstructions && <label className="editor-instruction-field">Instrucción<input maxLength={240} value={instructions} onChange={event => onInstructionsChange(event.target.value)} placeholder="Escribe o modifica la instrucción para el alumno"/></label>}
  </div>;
}
