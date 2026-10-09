import type { Activity } from "./default-activity";
import "./activity-settings.css";

export default function ActivityAnswerKey({ activity }: { activity: Activity }) {
  const rows: string[] = [];
  if (activity.questions?.length) activity.questions.forEach((question, index) => rows.push(`${index + 1}. ${question.prompt} — ${question.options.find(option => option.id === question.correctOptionId)?.text || "Sin respuesta marcada"}`));
  else if (activity.pairs?.length) activity.pairs.forEach(pair => rows.push(`${pair.left.text || "Imagen"} ↔ ${pair.right.text || "Imagen"}`));
  else if (activity.items?.length) activity.items.forEach(item => rows.push(`${item.text} — ${activity.groups?.find(group => group.id === item.groupId)?.title || "Sin grupo"}`));
  else if (activity.steps?.length) [...activity.steps].sort((a, b) => a.order - b.order).forEach((step, index) => rows.push(`${index + 1}. ${step.text}`));
  else if (activity.sentences?.length) activity.sentences.forEach(sentence => rows.push(`${sentence.before} ${sentence.answer} ${sentence.after}`.trim()));
  else if (activity.wordSentences?.length) activity.wordSentences.forEach(sentence => rows.push(sentence.text));
  else if (activity.wheelEntries?.length) activity.wheelEntries.forEach((entry, index) => rows.push(`${index + 1}. ${entry.text || "Reto con imagen"}`));
  else if (activity.wordSearchWords?.length) rows.push(...activity.wordSearchWords);
  else if (activity.crosswordClues?.length) activity.crosswordClues.forEach((clue, index) => rows.push(`${index + 1}. ${clue.clue} — ${clue.answer}`));
  else if (activity.labels?.length) activity.labels.forEach(label => rows.push(label.text));
  if (!rows.length) return null;
  return <section className="activity-answer-key"><h2>Respuestas</h2><ol>{rows.map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}</ol></section>;
}
