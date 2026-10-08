import type { FormativeField } from "./default-activity";

const MARKER = "aula-formative-field";

/** Keeps the NEM field alongside an activity's existing cover URL. URL fragments
 * are not sent to the image host, so the image itself continues to load normally. */
export function fieldFromCover(url?: string | null): FormativeField | "" {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.href);
    const value = new URLSearchParams(parsed.hash.replace(/^#/, "")).get(MARKER) || "";
    return ["lenguajes", "saberes", "etica", "humano"].includes(value) ? value as FormativeField : "";
  } catch { return ""; }
}

export function coverWithField(url: string, field?: string | null): string {
  try {
    const parsed = new URL(url, window.location.href);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    fragment.delete(MARKER);
    if (field && ["lenguajes", "saberes", "etica", "humano"].includes(field)) fragment.set(MARKER, field);
    parsed.hash = fragment.toString();
    return parsed.toString();
  } catch { return url; }
}
