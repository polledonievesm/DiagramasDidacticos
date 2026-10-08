import type { ReactNode } from "react";
import type { TemplateId } from "./activity-model";

const accents: Record<string, string> = {
  "diagram-labels": "#7d67dc", pairs: "#3189d6", quiz: "#388961", "quiz-show": "#ed8d35",
  "true-false": "#48a58c", "group-sort": "#dd9b27", sequence: "#427cbb", "complete-sentence": "#4b9a9b",
  "complete-phrase": "#428abb", "word-order": "#8065ba", flashcards: "#8065ba", roulette: "#e0873d",
  memory: "#49a078", "word-search": "#3f84b6",
};

/** Small hand-drawn SVG marks keep the template picker light and dependency-free. */
export default function TemplateIcon({ id }: { id: TemplateId }) {
  const color = accents[id] || "#51826a";
  const common = { fill: "none", stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let art: ReactNode;
  switch (id) {
    case "diagram-labels": art = <><rect x="8" y="10" width="32" height="24" rx="4" {...common}/><path d="M14 29l8-8 5 5 5-6 4 9" {...common}/><circle cx="33" cy="15" r="2" fill={color}/><path d="M8 5h9M38 38h7" {...common}/><circle cx="7" cy="5" r="2" fill="#efb24b"/><circle cx="44" cy="38" r="2" fill="#efb24b"/></> ; break;
    case "pairs": art = <><rect x="5" y="9" width="13" height="25" rx="4" {...common}/><rect x="31" y="9" width="13" height="25" rx="4" {...common}/><path d="M21 21h8m-4-4 4 4-4 4" {...common}/><circle cx="11.5" cy="16" r="2" fill={color}/><path d="M35 17h5M35 22h5" {...common}/></>; break;
    case "quiz": case "quiz-show": case "true-false": art = <><rect x="10" y="6" width="29" height="36" rx="5" {...common}/><path d="M16 15h3m5 0h11M16 24h3m5 0h11M16 33h3m5 0h11" {...common}/><path d={id === "true-false" ? "M16 14l2 2 4-5M16 23l2 2 4-5" : "M16 13h1M16 22h1M16 31h1"} {...common}/></>; break;
    case "group-sort": art = <><path d="M6 14h14l4 4h15v19H6z" {...common}/><rect x="10" y="23" width="8" height="8" rx="2" fill="#dceeff" stroke={color}/><rect x="22" y="23" width="8" height="8" rx="2" fill="#e3f3e5" stroke="#4e9c69"/><rect x="34" y="23" width="8" height="8" rx="2" fill="#fff0dd" stroke="#dd9b27"/></>; break;
    case "sequence": art = <><rect x="7" y="15" width="10" height="18" rx="3" {...common}/><rect x="21" y="15" width="10" height="18" rx="3" {...common}/><rect x="35" y="15" width="10" height="18" rx="3" {...common}/><path d="M12 9h26m-4-4 4 4-4 4" {...common}/><path d="M10 24h4m10 0h4m10 0h4" {...common}/></>; break;
    case "complete-sentence": case "complete-phrase": case "word-order": art = <><rect x="5" y="11" width="40" height="28" rx="5" {...common}/><path d="M11 20h8m4 0h7m4 0h5M11 30h8" {...common}/><rect x="24" y="25" width="12" height="10" rx="2" fill="#e5f3f3" stroke={color}/><path d="M39 30h1" {...common}/></>; break;
    case "flashcards": art = <><path d="M15 8h22a4 4 0 014 4v27H19a4 4 0 01-4-4z" {...common}/><path d="M15 12H9a4 4 0 00-4 4v23h28" {...common}/><path d="M23 20h10M23 26h10M23 32h7" {...common}/></>; break;
    case "roulette": art = <><circle cx="25" cy="27" r="17" {...common}/><path d="M25 10v17l14 9M25 27l-14 9m14-9L13 16m12 11 13-11" {...common}/><path d="M22 5h6l-3 7z" fill="#ee8e43" stroke={color}/><circle cx="25" cy="27" r="3" fill={color}/></>; break;
    case "memory": art = <><rect x="7" y="7" width="15" height="15" rx="4" fill="#e8f3e8" stroke={color} strokeWidth="2"/><rect x="28" y="7" width="15" height="15" rx="4" fill="#fff2d8" stroke="#dc9a36" strokeWidth="2"/><rect x="7" y="28" width="15" height="15" rx="4" fill="#fff2d8" stroke="#dc9a36" strokeWidth="2"/><rect x="28" y="28" width="15" height="15" rx="4" fill="#e8f3e8" stroke={color} strokeWidth="2"/><path d="M14 12l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5zM35 33l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z" fill={color}/></>; break;
    case "word-search": art = <><rect x="7" y="7" width="36" height="36" rx="4" {...common}/>{[[16,16],[25,16],[34,16],[16,25],[25,25],[34,25],[16,34],[25,34],[34,34]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.3" fill={color}/>)}<path d="M13 35l21-21" stroke="#e38a42" strokeWidth="3" strokeLinecap="round"/></>; break;
    default: art = <><circle cx="25" cy="25" r="17" {...common}/><path d="M25 16v18m-8-9h16" {...common}/></>;
  }
  return <svg className="template-icon-svg" viewBox="0 0 50 50" aria-hidden="true">{art}</svg>;
}
