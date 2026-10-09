import { useState } from "react";
import type { Activity, ActivityKind } from "./default-activity";
import { apiRequest, getTeacherKey } from "./gas-client";
import "./ai-generate.css";

type Props = { kind: ActivityKind | string; title?: string; teacherKey?: string; onGenerated: (patch: Partial<Activity>) => void };
const uid=()=>crypto.randomUUID();
const colors=["#43866e","#b9654f","#667eb1","#ac8e3d"];
function normalize(kind:string, raw:Record<string,any>):Partial<Activity>{
 if(["quiz","quiz-show","true-false"].includes(kind)) return {questions:(raw.questions||[]).map((q:any)=>{const options=kind==="true-false"?[{id:uid(),text:"Verdadero"},{id:uid(),text:"Falso"}]:(q.options||[]).map((text:string)=>({id:uid(),text:String(text)}));const index=kind==="true-false"?(q.correct===false?1:0):Math.max(0,Math.min(options.length-1,Number(q.correctIndex)||0));return{id:uid(),prompt:String(q.prompt||""),options,correctOptionId:options[index]?.id||""}})};
 if(kind==="group-sort"){const groups=(raw.groups||[]).map((title:string,i:number)=>({id:uid(),title:String(title),color:colors[i%colors.length]}));return{groups,items:(raw.items||[]).map((item:any)=>({id:uid(),text:String(item.text||""),groupId:groups[Math.max(0,Math.min(groups.length-1,Number(item.groupIndex)||0))]?.id||""}))}}
 if(kind==="sequence")return{steps:(raw.steps||[]).map((x:any,i:number)=>({id:uid(),text:String(x.text||""),order:i}))};
 if(["complete-sentence","complete-phrase"].includes(kind))return{sentences:(raw.sentences||[]).map((x:any)=>({id:uid(),before:String(x.before||""),answer:String(x.answer||""),after:String(x.after||"")}))};
 if(kind==="word-order")return{wordSentences:(raw.wordSentences||[]).map((x:any)=>({id:uid(),text:String(x.text||"")}))};
 if(["pairs","memory","flashcards"].includes(kind))return{pairs:(raw.pairs||[]).map((x:any)=>({id:uid(),left:{text:String(x.leftText||"")},right:{text:String(x.rightText||"")}}))};
 if(kind==="roulette")return{wheelEntries:(raw.wheelEntries||[]).map((x:any)=>({id:uid(),text:String(x.text||"")}))};
 if(kind==="word-search")return{wordSearchWords:(raw.wordSearchWords||[]).map(String)};
 if(kind==="crossword")return{crosswordClues:(raw.crosswordClues||[]).map((x:any)=>({id:uid(),clue:String(x.clue||""),answer:String(x.answer||""),direction:x.direction==="down"?"down":"across"}))};
 if(kind==="diagram")return{labels:(raw.labels||[]).slice(0,10).map((x:any,i:number)=>({id:uid(),text:String(x.text||""),color:["#2789e8","#d849cc","#fa7a16","#18884a","#a739cc","#ef563f","#2548d8","#13a783","#d17b18","#e52e45"][i],x:18+(i%4)*21,y:22+Math.floor(i/4)*24}))};
 return{};
}
export default function AiGenerate({kind,title="",teacherKey,onGenerated}:Props){
 const [open,setOpen]=useState(false),[topic,setTopic]=useState(""),[grade,setGrade]=useState("4.º de primaria"),[count,setCount]=useState(6),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function generate(){if(!topic.trim()){setMessage("Escribe el tema o contenido que quieres trabajar.");return}setBusy(true);setMessage("");try{const response=await apiRequest("/api/teacher/ai-generate",{method:"POST",headers:{"x-teacher-key":teacherKey||getTeacherKey()},body:JSON.stringify({kind,title,topic,grade,count})}),data=await response.json();if(!response.ok||data.error)throw Error(data.error||"No se pudo generar el contenido.");const patch=normalize(kind,data.content||{});if(!Object.keys(patch).length)throw Error("La IA no devolvió contenido para esta plantilla.");onGenerated(patch);setMessage("Contenido generado. Revísalo y edítalo antes de guardar.");setOpen(false)}catch(error){setMessage(error instanceof Error?error.message:"No se pudo generar el contenido.")}finally{setBusy(false)}}
 return <section className="ai-generate"><button type="button" className="ai-generate-toggle" onClick={()=>setOpen(!open)}>✦ Generar contenido con IA</button>{open&&<div className="ai-generate-form"><label>Tema<textarea rows={2} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Ej. partes de una planta, ciclo del agua…"/></label><div><label>Grado<input value={grade} onChange={e=>setGrade(e.target.value)}/></label><label>Cantidad<select value={count} onChange={e=>setCount(Number(e.target.value))}>{[3,4,5,6,8,10,12,15].map(n=><option key={n}>{n}</option>)}</select></label></div><p>Genera texto y respuestas para revisar. No crea imágenes.</p><button type="button" className="ai-generate-submit" disabled={busy} onClick={()=>void generate()}>{busy?"Generando…":"Generar y agregar"}</button></div>}{message&&<p className="ai-generate-message">{message}</p>}</section>
}
