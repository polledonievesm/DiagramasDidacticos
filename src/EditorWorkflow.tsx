import "./editor-components.css";

export default function EditorWorkflow({ template }: { template: string }) {
  return <div className="editor-workflow" aria-label="Pasos para crear una actividad">
    <a href="?panel=actividades">Elegir una plantilla</a><span aria-hidden="true">›</span>
    <strong aria-current="step">Introducir contenido</strong><span aria-hidden="true">›</span>
    <span className="editor-workflow-next">Jugar</span>
    <b className="editor-workflow-template">{template}</b>
  </div>;
}
