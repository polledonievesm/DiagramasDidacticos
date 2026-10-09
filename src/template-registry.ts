import type { TemplateId } from "./activity-model";

export type TemplateStatus = "ready" | "planned";
export type ContentFamily = "diagram" | "relations" | "questions" | "groups" | "sequence" | "text" | "cards" | "wheel" | "word-search" | "crossword";

export type TemplateDefinition = {
  id: TemplateId;
  title: string;
  kind: string;
  description: string;
  status: TemplateStatus;
  contentFamily: ContentFamily;
  supports: {
    text: boolean;
    images: boolean;
    timer: boolean;
    attempts: boolean;
    shuffle: boolean;
    sound: boolean;
    score: boolean;
  };
  editorFields: readonly string[];
};

const shared = { timer: true, attempts: true, shuffle: true, sound: true, score: true } as const;

export const templateRegistry: readonly TemplateDefinition[] = [
  { id: "diagram-labels", title: "Diagrama con etiquetas", kind: "Observa y señala", description: "Coloca cada chincheta en la parte correcta de una imagen.", status: "ready", contentFamily: "diagram", supports: { ...shared, text: true, images: true }, editorFields: ["title", "image", "labels", "points"] },
  { id: "pairs", title: "Une su pareja", kind: "Relaciona conceptos", description: "Arrastra cada palabra junto a la imagen o definición que le corresponde.", status: "ready", contentFamily: "relations", supports: { ...shared, text: true, images: true }, editorFields: ["title", "pairs", "instructions"] },
  { id: "quiz", title: "Cuestionario de opción múltiple", kind: "Responde", description: "Elige una respuesta entre varias opciones.", status: "ready", contentFamily: "questions", supports: { ...shared, text: true, images: true }, editorFields: ["title", "questions", "choices"] },
  { id: "quiz-show", title: "Concurso de preguntas", kind: "Compite", description: "Responde una ronda de preguntas en formato de concurso.", status: "ready", contentFamily: "questions", supports: { ...shared, text: true, images: true }, editorFields: ["title", "questions", "choices"] },
  { id: "true-false", title: "Verdadero o falso", kind: "Decide", description: "Lee cada afirmación y marca si es verdadera o falsa.", status: "ready", contentFamily: "questions", supports: { ...shared, text: true, images: true }, editorFields: ["title", "statements", "answers"] },
  { id: "group-sort", title: "Clasificar en grupos", kind: "Clasifica", description: "Organiza cada elemento dentro de su grupo.", status: "ready", contentFamily: "groups", supports: { ...shared, text: true, images: true }, editorFields: ["title", "groups", "items"] },
  { id: "sequence", title: "Ordenar secuencia", kind: "Ordena", description: "Acomoda los pasos en el orden correcto.", status: "ready", contentFamily: "sequence", supports: { ...shared, text: true, images: true }, editorFields: ["title", "steps"] },
  { id: "complete-sentence", title: "Completar oraciones", kind: "Completa", description: "Escribe o selecciona la palabra que falta.", status: "ready", contentFamily: "text", supports: { ...shared, text: true, images: true }, editorFields: ["title", "sentences", "answers"] },
  { id: "complete-phrase", title: "Completar la frase", kind: "Completa con letras", description: "Completa la frase seleccionando sus letras en una cuadrícula.", status: "ready", contentFamily: "text", supports: { ...shared, text: true, images: true }, editorFields: ["title", "sentences", "gridSize"] },
  { id: "word-order", title: "Orden correcto", kind: "Construye", description: "Organiza las palabras para formar una oración.", status: "ready", contentFamily: "text", supports: { ...shared, text: true, images: false }, editorFields: ["title", "sentences"] },
  { id: "flashcards", title: "Tarjetas", kind: "Repasa", description: "Voltea tarjetas para estudiar conceptos y definiciones.", status: "ready", contentFamily: "cards", supports: { ...shared, text: true, images: true }, editorFields: ["title", "cards"] },
  { id: "roulette", title: "Rueda giratoria", kind: "Elige al azar", description: "Gira para seleccionar una pregunta o tema.", status: "ready", contentFamily: "wheel", supports: { ...shared, text: true, images: true }, editorFields: ["title", "entries"] },
  { id: "memory", title: "Memorama", kind: "Encuentra pares", description: "Voltea cartas y encuentra las parejas relacionadas.", status: "ready", contentFamily: "relations", supports: { ...shared, text: true, images: true }, editorFields: ["title", "pairs"] },
  { id: "word-search", title: "Sopa de letras", kind: "Encuentra palabras", description: "Busca las palabras escondidas en la cuadrícula.", status: "ready", contentFamily: "word-search", supports: { ...shared, text: true, images: false }, editorFields: ["title", "words", "gridSize"] },
  { id: "crossword", title: "Crucigrama", kind: "Resuelve pistas", description: "Toca los números, lee las pistas y completa las palabras.", status: "ready", contentFamily: "crossword", supports: { ...shared, text: true, images: false }, editorFields: ["title", "clues", "answers"] },
] as const;

export function getTemplate(id: string | undefined) {
  return templateRegistry.find((template) => template.id === id);
}
