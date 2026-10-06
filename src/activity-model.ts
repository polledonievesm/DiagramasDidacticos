import type { Activity as LegacyActivity, MatchingPair } from "./default-activity";

export type TemplateId =
  | "diagram-labels" | "pairs" | "quiz" | "quiz-show" | "true-false" | "group-sort" | "sequence"
  | "complete-sentence" | "complete-phrase" | "word-order" | "flashcards" | "roulette" | "memory" | "word-search";

export type TimerMode = "none" | "up" | "down";
export type SharedSettings = {
  timerMode: TimerMode;
  timeLimitSeconds: number;
  maxAttempts: number | null;
  shuffle: boolean;
  sound: boolean;
  scoring: boolean;
};
export type DiagramContent = {
  type: "diagram";
  imageUrl: string;
  labels: LegacyActivity["labels"];
};
export type RelationContent = {
  type: "relations";
  pairs: MatchingPair[];
};
export type Question = {
  id: string;
  prompt: string;
  imageUrl?: string | null;
  choices: Array<{ id: string; text: string; imageUrl?: string | null; correct: boolean }>;
};
export type QuizContent = { type: "quiz"; questions: Question[] };
export type GroupContent = {
  type: "groups";
  groups: Array<{ id: string; title: string; color: string }>;
  items: Array<{ id: string; text: string; imageUrl?: string | null; groupId: string }>;
};
export type SequenceContent = { type: "sequence"; steps: Array<{ id: string; text: string; imageUrl?: string | null; order: number }> };
export type SentenceContent = { type: "sentences"; sentences: Array<{ id: string; before: string; answer: string; after: string; alternatives?: string[]; imageUrl?: string | null }>; gridSize?: number };
export type WordOrderContent = { type: "word-order"; sentences: Array<{ id: string; words: string[] }> };
export type CardsContent = { type: "cards"; cards: Array<{ id: string; front: { text: string; imageUrl?: string | null }; back: { text: string; imageUrl?: string | null } }> };
export type WheelContent = { type: "wheel"; entries: Array<{ id: string; text: string; imageUrl?: string | null }> };
export type WordSearchContent = { type: "word-search"; words: string[]; gridSize: number; directions: Array<"horizontal" | "vertical" | "diagonal"> };

export type ActivityContent =
  | DiagramContent | RelationContent | QuizContent | GroupContent | SequenceContent
  | SentenceContent | WordOrderContent | CardsContent | WheelContent | WordSearchContent;

export type CommonActivity = {
  schemaVersion: 2;
  id: string;
  templateId: TemplateId;
  title: string;
  instructions: string;
  settings: SharedSettings;
  content: ActivityContent;
};

const relationTemplates = new Set<TemplateId>(["pairs", "memory", "flashcards"]);

/** Adapts saved diagram and pair records without changing their IDs or student history. */
export function fromLegacyActivity(activity: LegacyActivity): CommonActivity {
  const isPairs = activity.kind === "pairs";
  return {
    schemaVersion: 2,
    id: activity.id,
    templateId: isPairs ? "pairs" : "diagram-labels",
    title: activity.title,
    instructions: activity.instructions,
    settings: {
      timerMode: activity.timerMode,
      timeLimitSeconds: activity.timeLimitSeconds,
      maxAttempts: activity.maxAttempts,
      shuffle: true,
      sound: true,
      scoring: true,
    },
    content: isPairs
      ? { type: "relations", pairs: activity.pairs || [] }
      : { type: "diagram", imageUrl: activity.imageUrl, labels: activity.labels },
  };
}

/**
 * Pair, memory, flashcard and simple multiple-choice views can reuse the same
 * two-sided content. Conversion changes only the selected template, preserving
 * pair IDs, wording and image URLs. Other conversions are deliberately rejected.
 */
export function convertRelationTemplate(activity: CommonActivity, target: TemplateId): CommonActivity {
  if (activity.content.type !== "relations" || !relationTemplates.has(activity.templateId) || !relationTemplates.has(target)) {
    throw new Error("Esta actividad no tiene contenido compatible con esa plantilla.");
  }
  return { ...activity, templateId: target, content: structuredClone(activity.content) };
}

export function isTemplateImplemented(id: TemplateId): boolean {
  return ["diagram-labels", "pairs", "quiz", "quiz-show", "true-false", "group-sort", "sequence", "complete-sentence", "complete-phrase", "word-order", "flashcards", "memory", "roulette", "word-search"].includes(id);
}
