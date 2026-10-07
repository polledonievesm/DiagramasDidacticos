export type DigestiveLabel = { id: string; text: string; color: string; x: number; y: number };
export type PairSide = { text: string; imageUrl?: string | null; imageData?: string | null };
export type MatchingPair = { id: string; left: PairSide; right: PairSide };
export type QuizOption = { id: string; text: string };
export type QuizQuestion = { id: string; prompt: string; imageUrl?: string | null; imageData?: string | null; options: QuizOption[]; correctOptionId: string };
export type SortGroup = { id: string; title: string; color: string };
export type SortItem = { id: string; text: string; imageUrl?: string | null; imageData?: string | null; groupId: string };
export type SequenceStep = { id: string; text: string; imageUrl?: string | null; imageData?: string | null; order: number };
export type FillSentence = { id: string; before: string; answer: string; after: string; imageUrl?: string | null; imageData?: string | null };
export type WordOrderSentence = { id: string; text: string; wordStyles?: Array<{ bold?: boolean; italic?: boolean; underline?: boolean }>; words?: Array<{ id: string; text: string; order: number; bold?: boolean; italic?: boolean; underline?: boolean }> };
export type WheelEntry = { id: string; text: string; imageUrl?: string | null; imageData?: string | null };
export type ActivityKind = "diagram" | "pairs" | "quiz" | "quiz-show" | "true-false" | "group-sort" | "sequence" | "flashcards" | "memory" | "complete-sentence" | "complete-phrase" | "word-order" | "roulette" | "word-search";
export type Activity = {
  kind?: ActivityKind;
  pairs?: MatchingPair[];
  questions?: QuizQuestion[];
  groups?: SortGroup[];
  items?: SortItem[];
  steps?: SequenceStep[];
  sentences?: FillSentence[];
  wordSentences?: WordOrderSentence[];
  wheelEntries?: WheelEntry[];
  wordSearchWords?: string[];
  wordSearchGridSize?: number;
  phraseGridSize?: number;
  wordSearchDirections?: string[];
  shuffle?: boolean;
  sound?: boolean;
  scoring?: boolean;
  id: string;
  title: string;
  instructions: string;
  timerMode: "none" | "up" | "down";
  timeLimitSeconds: number;
  maxAttempts: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  coverImageUrl?: string | null;
  cardTheme?: "mint" | "sky" | "lilac" | "peach";
  imageUrl: string;
  imageKey?: string | null;
  labels: DigestiveLabel[];
};

export const activityInstructions = "Arrastra y suelta las chinchetas en su lugar correcto de la imagen.";

export const defaultActivity: Activity = {
  id: "digestivo-inicial",
  title: "Partes del sistema digestivo",
  instructions: activityInstructions,
  timerMode: "down",
  timeLimitSeconds: 180,
  maxAttempts: 3,
  imageUrl: "./sistema-digestivo.png",
  imageKey: null,
  labels: [
    { id: "boca", text: "Boca", color: "#2789e8", x: 42, y: 13 },
    { id: "glandulas-salivales", text: "Glándulas salivales", color: "#d849cc", x: 57, y: 12 },
    { id: "esofago", text: "Esófago", color: "#fa7a16", x: 48, y: 35 },
    { id: "higado", text: "Hígado", color: "#18884a", x: 39, y: 45 },
    { id: "estomago", text: "Estómago", color: "#a739cc", x: 54, y: 47 },
    { id: "pancreas", text: "Páncreas", color: "#ef563f", x: 54, y: 53 },
    { id: "intestino-delgado", text: "Intestino delgado", color: "#2548d8", x: 51, y: 66 },
    { id: "intestino-grueso", text: "Intestino grueso", color: "#13a783", x: 69, y: 65 },
    { id: "apendice", text: "Apéndice", color: "#d17b18", x: 38, y: 74 },
    { id: "ano", text: "Ano", color: "#e52e45", x: 50, y: 87 },
  ],
};
