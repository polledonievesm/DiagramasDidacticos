import { useEffect, useRef, type DragEvent } from "react";
import "./editor-components.css";

type Props = {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragReorder?: (from: number, to: number) => void;
  index?: number;
  onDuplicate: () => void;
  onDelete: () => void;
  first?: boolean;
  last?: boolean;
  duplicateDisabled?: boolean;
  deleteDisabled?: boolean;
};

const paths = {
  grip: <><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>,
  duplicate: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/><path d="M14 11v6m-3-3h6"/></>,
  delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>
};

export default function EditorItemActions({ onDragReorder, index, onDuplicate, onDelete, duplicateDisabled = false, deleteDisabled = false }: Props) {
  const handle = useRef<HTMLButtonElement>(null);
  const draggedIndex = useRef<number | null>(null);
  useEffect(() => {
    const row = handle.current?.closest<HTMLElement>("article, .cw-clue-row, .label-row");
    if (row && index !== undefined) row.dataset.editorIndex = String(index);
  }, [index]);
  const icon = (name: keyof typeof paths) => <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
  const finishDrag = (event: DragEvent<HTMLButtonElement>) => {
    if (index === undefined || !onDragReorder) return;
    const from = draggedIndex.current;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-editor-index]");
    const to = Number(target?.dataset.editorIndex);
    if (from !== null && Number.isInteger(to) && from !== to) onDragReorder(from, to);
    draggedIndex.current = null;
  };
  return <div className="editor-row-actions">
    <button ref={handle} type="button" className="editor-row-action editor-drag-handle" title="Arrastra para cambiar de lugar" aria-label="Arrastrar para cambiar de lugar" draggable onDragStart={event => { draggedIndex.current = index ?? null; if (index !== undefined) event.dataTransfer.setData("application/x-aula-row-index", String(index)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={finishDrag}>{icon("grip")}</button>
    <button type="button" className="editor-row-action" title="Duplicar" aria-label="Duplicar" disabled={duplicateDisabled} onClick={onDuplicate}>{icon("duplicate")}</button>
    <button type="button" className="editor-row-action editor-action-delete" title="Eliminar" aria-label="Eliminar" disabled={deleteDisabled} onClick={onDelete}>{icon("delete")}</button>
  </div>;
}
