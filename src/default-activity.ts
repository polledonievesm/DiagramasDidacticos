export type DigestiveLabel = { id: string; text: string; color: string; x: number; y: number };
export type Activity = {
  id: string;
  title: string;
  instructions: string;
  timerMode: "none" | "up" | "down";
  timeLimitSeconds: number;
  maxAttempts: number | null;
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
