import { useEffect, useState } from "react";
import type { Activity, ActivityKind, QuizQuestion, SortItem, SequenceStep } from "./default-activity";
import { apiRequest, forgetTeacherKey, getTeacherKey, rememberTeacherKey, supportsActivityKind, saveActivityAvailability, getStudentSession, saveStudentSession, clearStudentSession } from "./gas-client";
import ActivitySettings from "./ActivitySettings";
import ActivityLeaderboard, { type LeaderboardRow } from "./ActivityLeaderboard";
import ActivityAnswerKey from "./ActivityAnswerKey";
import FocusBlurGuard from "./FocusBlurGuard";
import EditorContentHeader from "./EditorContentHeader";
import EditorImagePicker from "./EditorImagePicker";
import EditorItemActions from "./EditorItemActions";
import EditorWorkflow from "./EditorWorkflow";
import "./template-game.css";
import PasswordField from "./PasswordField";
import { imageFileToDataUrl } from "./image-utils";

type Student = { paternalSurname:string; maternalSurname:string; givenNames:string };
type QuizKind = "quiz" | "quiz-show" | "true-false";
type Props = { kind: QuizKind | "group-sort" | "sequence" };
type Score = { correct:number; total:number; grade:number; elapsedSeconds:number; remainingSeconds:number|null; timedOut:boolean; attemptsRemaining:number|null };
const colors=["#43866e","#b9654f","#667eb1","#ac8e3d","#7f6caa"];
const id=()=>crypto.randomUUID();
const blank=(kind:Props["kind"]):Activity=>({
 id:"",kind,title:"",instructions:kind==="true-false"?"Lee cada afirmación y decide si es verdadera o falsa.":kind==="quiz-show"?"Responde las preguntas del concurso.":kind==="quiz"?"Elige la respuesta correcta.":kind==="group-sort"?"Coloca cada elemento en el grupo que corresponde.":"Ordena los pasos de la actividad.",
 timerMode:"none",timeLimitSeconds:180,maxAttempts:3,imageUrl:"",labels:[],shuffle:true,sound:true,scoring:true,
 questions:["quiz","quiz-show","true-false"].includes(kind)?[{id:id(),prompt:"",options:kind==="true-false"?[{id:id(),text:"Verdadero"},{id:id(),text:"Falso"}]:[{id:id(),text:""},{id:id(),text:""}],correctOptionId:""}]:[],
 groups:kind==="group-sort"?[{id:id(),title:"Grupo 1",color:colors[0]},{id:id(),title:"Grupo 2",color:colors[1]}]:[],
 items:kind==="group-sort"?[{id:id(),text:"",groupId:""},{id:id(),text:"",groupId:""},{id:id(),text:"",groupId:""}]:[],
 steps:kind==="sequence"?[{id:id(),text:"",order:0},{id:id(),text:"",order:1},{id:id(),text:"",order:2}]:[],
});
const fmt=(value:number)=>{const n=Math.max(0,Math.floor(value));return Math.floor(n/60)+":"+String(n%60).padStart(2,"0")};
function randomize<T>(items:T[]){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function readImage(file?:File){return imageFileToDataUrl(file)}

export default function TemplateGame({kind}:Props){
 const previewMode=new URLSearchParams(location.search).get("vista")==="docente";
 const isQuestionGame=["quiz","quiz-show","true-false"].includes(kind);
 const isTrueFalse=kind==="true-false";
 const [screen,setScreen]=useState<"loading"|"teacher-key"|"teacher"|"teacher-error"|"login"|"play"|"contest-intro"|"result"|"unsupported">("loading");
 const [activity,setActivity]=useState<Activity>(()=>blank(kind));
 const [draft,setDraft]=useState<Activity>(()=>blank(kind));
 const [teacherKey,setTeacherKey]=useState(getTeacherKey());
 const [keyDraft,setKeyDraft]=useState("");
 const [student,setStudent]=useState<Student|null>(()=>{const saved=getStudentSession()?.student;return saved?{paternalSurname:saved.paternalSurname,maternalSurname:saved.maternalSurname,givenNames:saved.givenNames}:null});
 const [studentToken,setStudentToken]=useState(()=>getStudentSession()?.token||"");
 const [credentials,setCredentials]=useState({username:"",password:""});
 const [activityList,setActivityList]=useState<Activity[]>([]);
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const [remaining,setRemaining]=useState<number|null>(null);
 const [attempts,setAttempts]=useState<number|null>(null);
 const [score,setScore]=useState<Score|null>(null);
 const [timedOut,setTimedOut]=useState(false);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [order,setOrder]=useState<SequenceStep[]>([]);
 const [playQuestions,setPlayQuestions]=useState<QuizQuestion[]>([]);
 const [playItems,setPlayItems]=useState<SortItem[]>([]);
 const [muted,setMuted]=useState(false);
 const [leaderboard,setLeaderboard]=useState<LeaderboardRow[]>([]);
 const title=kind==="quiz-show"?"Concurso de preguntas":kind==="true-false"?"Verdadero o falso":kind==="quiz"?"Cuestionario de opción múltiple":kind==="group-sort"?"Clasificar en grupos":"Ordenar secuencias";
 const playTotal=isQuestionGame?activity.questions?.length||0:kind==="group-sort"?activity.items?.length||0:activity.steps?.length||0;
 const timerText=activity.timerMode==="down"?fmt(remaining??0):fmt(seconds);

 async function getTeacherActivities(key:string){
  const response=await apiRequest("/api/teacher/activities",{headers:{"x-teacher-key":key}}),data=await response.json();
  if(!response.ok||!Array.isArray(data))throw Error(data.error||"No se pudo abrir el panel.");
  const filtered=(data as Activity[]).filter(item=>item.kind===kind);setActivityList(filtered);return filtered;
 }
 async function loadSaved(savedId:string){
  const response=await apiRequest("/api/activity?id="+encodeURIComponent(savedId)),data=await response.json();
  if(!response.ok)throw Error(data.error||"No se encontró la actividad.");
  setActivity(data);setDraft(data);return data as Activity;
 }
 useEffect(()=>{
  const q=new URLSearchParams(location.search);
  if(q.get("modo")==="maestro"){
   const key=getTeacherKey();
   if(!key){setScreen("teacher-key");return}
   setTeacherKey(key);
   const savedId=q.get("actividad");
   if(!savedId&&q.get("nueva")==="1"){
    const fresh=blank(kind);setDraft(fresh);setActivity(fresh);setScreen("teacher");
    void supportsActivityKind(kind).then(supported=>{if(!supported){setNotice("El editor está listo, pero Apps Script necesita actualizarse para guardar esta plantilla.");return}return getTeacherActivities(key)}).catch(e=>setNotice(e instanceof Error?e.message:"No se pudo actualizar la lista de actividades."));
    return;
   }
   void supportsActivityKind(kind).then(supported=>{if(!supported){setNotice("Para activar esta plantilla, actualiza el Apps Script existente desde el archivo Code.gs del proyecto.");setScreen("unsupported");return false}return true}).then(supported=>supported?getTeacherActivities(key):null).then(async result=>{if(!result)return;
    if(savedId)await loadSaved(savedId);
    setScreen("teacher")
   }).catch(e=>{setNotice(e instanceof Error?e.message:"No se pudo cargar el editor.");setScreen("teacher-error")});
   return;
  }
  const activityId=q.get("actividad");
  if(!activityId){setScreen("teacher-key");return}
  void loadSaved(activityId).then(()=>setScreen("login")).catch(e=>{setNotice(e instanceof Error?e.message:"No se pudo abrir la actividad.");setScreen("login")});
 },[]);
 useEffect(()=>{
  if(screen!=="play")return;
  const t=window.setInterval(()=>{
   setSeconds(s=>s+1);
   if(activity.timerMode==="down")setRemaining(r=>{if(r===null)return null;if(r<=1){setTimedOut(true);return 0}return r-1});
  },1000);
  return()=>window.clearInterval(t)
 },[screen,activity.timerMode]);

 async function teacherEnter(event:React.FormEvent){
  event.preventDefault();setBusy(true);setNotice("");
  try{if(!await supportsActivityKind(kind)){setNotice("Actualiza primero el Apps Script existente con el archivo Code.gs de la plataforma.");setScreen("unsupported");return}await getTeacherActivities(keyDraft);setTeacherKey(keyDraft);rememberTeacherKey(keyDraft);const q=new URLSearchParams(location.search);if(q.get("actividad"))await loadSaved(q.get("actividad")!);else if(q.get("nueva")==="1"){const fresh=blank(kind);setActivity(fresh);setDraft(fresh)}setScreen("teacher")}
  catch(e){setNotice(e instanceof Error?e.message:"No se pudo validar la clave.")}
  finally{setBusy(false)}
 }
 async function save(event:React.FormEvent){
  event.preventDefault();setBusy(true);setNotice("");
  try{
   const payload={...draft,id:draft.id||"actividad-"+id(),kind,labels:[],pairs:[]};
   if(isQuestionGame&&(!payload.questions?.length||payload.questions.some(q=>!q.prompt.trim()||q.options.length<2||q.options.some(o=>!o.text.trim())||!q.options.some(o=>o.id===q.correctOptionId))))throw Error("Completa cada pregunta, sus opciones y marca una respuesta correcta.");
   if(kind==="group-sort"&&((payload.groups?.length||0)<2||!payload.items?.length||payload.items.some(item=>!item.text.trim()||!payload.groups?.some(g=>g.id===item.groupId))))throw Error("Completa los grupos y asigna cada elemento a uno.");
   if(kind==="sequence"&&((payload.steps?.length||0)<2||payload.steps?.some(step=>!step.text.trim())))throw Error("Escribe al menos dos pasos.");
   const response=await apiRequest("/api/teacher/activity",{method:"POST",headers:{"x-teacher-key":teacherKey},body:JSON.stringify(payload)}),data=await response.json();
   if(!response.ok)throw Error(data.error||"No se pudo guardar.");
   setActivity({...data,availableFrom:payload.availableFrom||null,availableUntil:payload.availableUntil||null});setDraft({...data,availableFrom:payload.availableFrom||null,availableUntil:payload.availableUntil||null});
   await saveActivityAvailability(teacherKey,payload);
   window.location.assign("?panel=actividades");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar la actividad.")}
  finally{setBusy(false)}
 }
 async function start(profile:Student|null=student,token=studentToken){
  if(!activity.id||(!previewMode&&(!profile||!token)))return;
  if(playTotal===0){setNotice("Esta actividad todavía no tiene contenido. El maestro debe terminar de configurarla antes de compartirla.");return;}
  setBusy(true);setNotice("");
  try{
   if(previewMode)setAttempts(null);else{const query=new URLSearchParams({activityId:activity.id,studentToken:token,paternalSurname:profile!.paternalSurname,maternalSurname:profile!.maternalSurname,givenNames:profile!.givenNames});const response=await apiRequest("/api/attempts?"+query),data=await response.json();if(!response.ok||!data.canStart)throw Error(data.error||"Ya no tienes intentos.");setAttempts(data.remaining===null?null:Number(data.remaining));}
   setRemaining(activity.timerMode==="down"?activity.timeLimitSeconds:null);setSeconds(0);setTimedOut(false);setAnswers({});
   const shuffleQuestions=activity.shuffleQuestions??activity.shuffle!==false,shuffleAnswers=activity.shuffleAnswers??activity.shuffle!==false;
   if(isQuestionGame)setPlayQuestions((shuffleQuestions?randomize(activity.questions||[]):[...(activity.questions||[])]).map(q=>({...q,options:shuffleAnswers?randomize(q.options):[...q.options]})));
   if(kind==="group-sort")setPlayItems(shuffleQuestions?randomize(activity.items||[]):[...(activity.items||[])]);
   if(kind==="sequence")setOrder(shuffleQuestions?randomize(activity.steps||[]):[...(activity.steps||[])]);
   setScreen(kind==="quiz-show"&&!previewMode?"contest-intro":"play");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo iniciar.")}
  finally{setBusy(false)}
 }
 async function studentLogin(event:React.FormEvent){
  event.preventDefault();setBusy(true);setNotice("");
  try{
   const response=await apiRequest("/api/student/login",{method:"POST",body:JSON.stringify(credentials)}),data=await response.json();
   if(!response.ok)throw Error(data.error||"Usuario o contraseña incorrectos.");
   saveStudentSession(String(data.token),{...data.student,id:String(data.student.id)});setStudent(data.student);setStudentToken(data.token);setCredentials({username:"",password:""});setBusy(false);
   await start(data.student,data.token);
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo iniciar sesión.");setBusy(false)}
 }
 async function finish(expired=false){
  if(!activity.id||(!previewMode&&!student)||busy)return;
  setBusy(true);setNotice("");
  try{
   const answerPayload=kind==="sequence"?{order:order.map(step=>step.id)}:answers;
   if(previewMode){const correct=isQuestionGame?(activity.questions||[]).filter(q=>answers[q.id]===q.correctOptionId).length:kind==="group-sort"?(activity.items||[]).filter(item=>answers[item.id]===item.groupId).length:(activity.steps||[]).filter((step,index)=>order[index]?.id===step.id).length;const total=playTotal;setScore({correct,total,grade:total?Math.round(correct/total*100)/10:0,elapsedSeconds:seconds,remainingSeconds:activity.timerMode==="down"?Math.max(0,activity.timeLimitSeconds-seconds):null,timedOut:expired||timedOut,attemptsRemaining:null});setScreen("result");return;}
   const response=await apiRequest("/api/submit",{method:"POST",body:JSON.stringify({activityId:activity.id,studentToken,paternalSurname:student!.paternalSurname,maternalSurname:student!.maternalSurname,givenNames:student!.givenNames,answers:answerPayload,elapsedSeconds:seconds,remainingSeconds:activity.timerMode==="down"?Math.max(0,activity.timeLimitSeconds-seconds):null,timedOut:expired||timedOut})}),data=await response.json();
   if(!response.ok)throw Error(data.error||"No se pudo guardar el resultado.");
   setScore(data);setAttempts(data.attemptsRemaining===null?null:Number(data.attemptsRemaining));
   if(activity.showLeaderboard){const board=await apiRequest("/api/leaderboard?activityId="+encodeURIComponent(activity.id));if(board.ok)setLeaderboard(await board.json() as LeaderboardRow[])}
   setScreen("result");
   if(activity.sound!==false&&!muted)beep();
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo calificar.");setTimedOut(false)}
  finally{setBusy(false)}
 }
 useEffect(()=>{if(timedOut&&screen==="play")void finish(true)},[timedOut]);
 useEffect(()=>{if(previewMode&&screen==="login"&&activity.id)void start()},[previewMode,screen,activity.id]);
 function beep(){try{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=660;gain.gain.value=.04;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.22);osc.onended=()=>void ctx.close()}catch{}}
 function moveStep(index:number,offset:number){const next=[...order],to=index+offset;if(to<0||to>=next.length)return;[next[index],next[to]]=[next[to],next[index]];setOrder(next)}
 function moveList<T>(list:T[],index:number,offset:number){const next=[...list],to=index+offset;if(to<0||to>=next.length)return next;[next[index],next[to]]=[next[to],next[index]];return next}
 function moveListTo<T>(list:T[],from:number,to:number){const next=[...list],[item]=next.splice(from,1);next.splice(to,0,item);return next}

 function questionField(q:QuizQuestion,index:number){
  return <article className="tg-editor-row tg-quiz-question-row" key={q.id}>
   <header><strong>Pregunta {index+1}</strong><EditorItemActions first={index===0} last={index===draft.questions!.length-1} index={index} onDragReorder={(from,to)=>setDraft(d=>({...d,questions:moveListTo(d.questions||[],from,to)}))} deleteDisabled={draft.questions!.length<=1} onMoveUp={()=>setDraft(d=>({...d,questions:moveList(d.questions||[],index,-1)}))} onMoveDown={()=>setDraft(d=>({...d,questions:moveList(d.questions||[],index,1)}))} onDuplicate={()=>{const copy={...q,id:id(),options:q.options.map(option=>({...option,id:id()}))};setDraft(d=>({...d,questions:[...d.questions!.slice(0,index+1),copy,...d.questions!.slice(index+1)]}))}} onDelete={()=>setDraft(d=>({...d,questions:d.questions!.filter(x=>x.id!==q.id)}))}/></header>
   <label className="tg-prompt-label">Pregunta<div className="tg-field-with-image"><input value={q.prompt} onChange={e=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,prompt:e.target.value}:x)})} placeholder="Escribe la pregunta"/><EditorImagePicker value={q.imageData||q.imageUrl} onChange={imageData=>setDraft(d=>({...d,questions:d.questions!.map(x=>x.id===q.id?{...x,imageData,imageUrl:""}:x)}))}/></div></label>
   <div className={"tg-options"+(isTrueFalse?" tg-boolean-options":"")}>{q.options.map((option,j)=><label key={option.id} className={!isTrueFalse?"tg-quiz-option":undefined}>{isTrueFalse?<><input type="radio" name={"correct-"+q.id} aria-label={"Respuesta correcta: "+option.text} checked={q.correctOptionId===option.id} onChange={()=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,correctOptionId:option.id}:x)})}/><strong>{option.text}</strong></>:<><span className="tg-option-letter">{String.fromCharCode(65+j)}</span><div className="tg-field-with-image tg-option-field"><input aria-label={`Respuesta ${String.fromCharCode(65+j)}`} value={option.text} onChange={e=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,options:x.options.map(o=>o.id===option.id?{...o,text:e.target.value}:o)}:x)})}/><EditorImagePicker value={option.imageData||option.imageUrl} onChange={imageData=>setDraft(d=>({...d,questions:d.questions!.map(x=>x.id===q.id?{...x,options:x.options.map(o=>o.id===option.id?{...o,imageData,imageUrl:""}:o)}:x)}))} label={`Imagen de la opción ${String.fromCharCode(65+j)}`}/></div><button type="button" className={`tg-correct-mark ${q.correctOptionId===option.id?"is-correct":"is-incorrect"}`} aria-label={q.correctOptionId===option.id?"Respuesta correcta; cambiar selección":"Marcar como respuesta correcta"} title={q.correctOptionId===option.id?"Correcta":"Incorrecta; pulsa para marcarla como correcta"} onClick={()=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,correctOptionId:option.id}:x)})}>{q.correctOptionId===option.id?"✓":"×"}</button></>}</label>)}</div>
   {!isTrueFalse&&<button type="button" className="tg-subtle" onClick={()=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,options:[...x.options,{id:id(),text:""}]}:x)})} disabled={q.options.length>=5}>＋ Añadir opción</button>}
  </article>;
 }

 if(screen==="loading")return <main className="tg-page" aria-live="polite"><section className="tg-login"><span className="tg-kicker">AULA EN JUEGO</span><h1>Abriendo {title.toLocaleLowerCase("es-MX")}</h1><p>Estamos cargando el editor o la actividad. Esto puede tardar unos segundos.</p></section></main>;
 if(screen==="teacher-error")return <main className="tg-page"><section className="tg-login"><span className="tg-kicker">NO SE PUDO CARGAR</span><h1>{title}</h1><p>{notice}</p><button className="tg-primary" onClick={()=>location.reload()}>Reintentar</button><a href="./?panel=actividades">Volver a Mis actividades</a></section></main>;
 if(screen==="unsupported")return <main className="tg-page"><section className="tg-login"><span className="tg-kicker">PLANTILLA EN PREPARACIÓN</span><h1>{title}</h1><p>{notice}</p><a href="./?panel=actividades">Volver a Mis actividades</a></section></main>;
 if(screen==="teacher-key")return <main className="tg-page"><header className="tg-header"><a href="./">Aula en juego</a><a href="?panel=actividades">Mis actividades</a></header><form className="tg-login" onSubmit={teacherEnter}><span className="tg-kicker">EDITOR DE ACTIVIDAD · {title.toLocaleUpperCase("es-MX")}</span><h1>Acceso del maestro</h1><p>Ingresa la clave para crear o editar una actividad.</p><label>Clave del maestro<PasswordField required value={keyDraft} onChange={e=>setKeyDraft(e.target.value)}/></label>{notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary" disabled={busy}>{busy?"Conectando…":"Continuar al editor"}</button></form></main>;

 if(screen==="teacher")return <main className="tg-page"><header className="tg-header"><a href="./?panel=actividades">Mis actividades</a><span>{title}</span></header><section className="tg-shell"><EditorWorkflow template={title}/>
 <form className="tg-form" onSubmit={save}><div className="tg-full"><EditorContentHeader title={draft.title} instructions={draft.instructions} onTitleChange={value=>setDraft(d=>({...d,title:value}))} onInstructionsChange={value=>setDraft(d=>({...d,instructions:value}))}/></div>
 {isQuestionGame&&<section className="tg-full"><h2>{isTrueFalse?"Afirmaciones y respuestas":"Preguntas y opciones"}</h2>{(draft.questions||[]).map(questionField)}<button type="button" className="tg-add" onClick={()=>setDraft({...draft,questions:[...draft.questions!,{id:id(),prompt:"",options:isTrueFalse?[{id:id(),text:"Verdadero"},{id:id(),text:"Falso"}]:[{id:id(),text:""},{id:id(),text:""}],correctOptionId:""}]})}>＋ Añadir {isTrueFalse?"afirmación":"pregunta"}</button></section>}
 {kind==="group-sort"&&<><section className="tg-full"><h2>Grupos</h2><div className="tg-groups">{(draft.groups||[]).map((group,index)=><article className="tg-group-edit-row" key={group.id}><label>Grupo {index+1}<input value={group.title} onChange={e=>setDraft(d=>({...d,groups:d.groups!.map(g=>g.id===group.id?{...g,title:e.target.value}:g)}))}/></label><EditorItemActions first={index===0} last={index===draft.groups!.length-1} index={index} onDragReorder={(from,to)=>setDraft(d=>({...d,groups:moveListTo(d.groups||[],from,to)}))} deleteDisabled={draft.groups!.length<=2} onMoveUp={()=>setDraft(d=>({...d,groups:moveList(d.groups||[],index,-1)}))} onMoveDown={()=>setDraft(d=>({...d,groups:moveList(d.groups||[],index,1)}))} onDuplicate={()=>{const copy={...group,id:id(),title:group.title+" (copia)"};setDraft(d=>({...d,groups:[...d.groups!.slice(0,index+1),copy,...d.groups!.slice(index+1)]}))}} onDelete={()=>setDraft(d=>{const keep=d.groups!.filter(g=>g.id!==group.id),fallback=keep[0]?.id||"";return {...d,groups:keep,items:d.items!.map(item=>item.groupId===group.id?{...item,groupId:fallback}:item)}})}/></article>)}</div><button type="button" className="tg-subtle" onClick={()=>setDraft({...draft,groups:[...draft.groups!,{id:id(),title:"Nuevo grupo",color:colors[draft.groups!.length%colors.length]}]})} disabled={draft.groups!.length>=8}>＋ Añadir grupo</button></section><section className="tg-full tg-group-items"><h2>Elementos para clasificar</h2>{(draft.items||[]).map((item,index)=><article className="tg-editor-row tg-compact-item-row" key={item.id}><header><strong>Elemento {index+1}</strong><EditorItemActions first={index===0} last={index===draft.items!.length-1} index={index} onDragReorder={(from,to)=>setDraft(d=>({...d,items:moveListTo(d.items||[],from,to)}))} deleteDisabled={draft.items!.length<=2} onMoveUp={()=>setDraft(d=>({...d,items:moveList(d.items||[],index,-1)}))} onMoveDown={()=>setDraft(d=>({...d,items:moveList(d.items||[],index,1)}))} onDuplicate={()=>{const copy={...item,id:id()};setDraft(d=>({...d,items:[...d.items!.slice(0,index+1),copy,...d.items!.slice(index+1)]}))}} onDelete={()=>setDraft(d=>({...d,items:d.items!.filter(x=>x.id!==item.id)}))}/></header><div className="tg-fields"><label>Texto<div className="tg-field-with-image"><input value={item.text} onChange={e=>setDraft({...draft,items:draft.items!.map(x=>x.id===item.id?{...x,text:e.target.value}:x)})}/><EditorImagePicker value={item.imageData||item.imageUrl} onChange={imageData=>setDraft(d=>({...d,items:d.items!.map(x=>x.id===item.id?{...x,imageData,imageUrl:""}:x)}))}/></div></label><label>Grupo correcto<select value={item.groupId} onChange={e=>setDraft({...draft,items:draft.items!.map(x=>x.id===item.id?{...x,groupId:e.target.value}:x)})}><option value="">Selecciona grupo</option>{draft.groups!.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label></div></article>)}<button type="button" className="tg-add" onClick={()=>setDraft({...draft,items:[...draft.items!,{id:id(),text:"",groupId:draft.groups![0]?.id||"",imageData:""}]})}>＋ Añadir elemento</button></section></>}
 {kind==="sequence"&&<section className="tg-full tg-sequence-editor"><h2>Elementos en el orden correcto</h2>{(draft.steps||[]).map((step,index)=><article className="tg-editor-row tg-sequence-edit-row" key={step.id}><header><strong>{index+1}°</strong><EditorItemActions first={index===0} last={index===draft.steps!.length-1} index={index} onDragReorder={(from,to)=>setDraft(d=>({...d,steps:moveListTo(d.steps||[],from,to)}))} deleteDisabled={draft.steps!.length<=2} onMoveUp={()=>setDraft(d=>({...d,steps:moveList(d.steps||[],index,-1)}))} onMoveDown={()=>setDraft(d=>({...d,steps:moveList(d.steps||[],index,1)}))} onDuplicate={()=>{const copy={...step,id:id()};setDraft(d=>({...d,steps:[...d.steps!.slice(0,index+1),copy,...d.steps!.slice(index+1)]}))}} onDelete={()=>setDraft(d=>({...d,steps:d.steps!.filter(x=>x.id!==step.id)}))}/></header><label className="tg-sequence-text"><span className="sr-only">Elemento {index+1}</span><div className="tg-field-with-image"><input aria-label={`Elemento ${index+1}`} value={step.text} onChange={e=>setDraft(d=>({...d,steps:d.steps!.map(x=>x.id===step.id?{...x,text:e.target.value}:x)}))}/><EditorImagePicker value={step.imageData||step.imageUrl} onChange={imageData=>setDraft(d=>({...d,steps:d.steps!.map(x=>x.id===step.id?{...x,imageData,imageUrl:""}:x)}))}/></div></label></article>)}<button type="button" className="tg-add" onClick={()=>setDraft({...draft,steps:[...draft.steps!,{id:id(),text:"",order:draft.steps!.length,imageData:""}]})}>＋ Añadir un elemento</button></section>}
 <div className="tg-full"><ActivitySettings value={draft} onChange={setDraft}/></div>
 <div className="tg-save tg-full">{notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary" disabled={busy}>{busy?"Guardando…":"Guardar actividad"}</button>{activity.id&&<button type="button" className="tg-subtle" onClick={()=>navigator.clipboard.writeText(location.origin+location.pathname+"?juego="+kind+"&actividad="+encodeURIComponent(activity.id)).then(()=>setNotice("Enlace copiado."))}>Copiar enlace para alumnos</button>}</div>
 </form></section></main>;

 if(screen==="contest-intro")return <main className="tg-page tg-contest-page"><section className="tg-contest-intro"><span className="tg-kicker">CONCURSO DE PREGUNTAS</span><div className="tg-contest-emblem" aria-hidden="true">★</div><h1>{activity.title}</h1><p>{activity.instructions}</p><div className="tg-contest-stats"><span>{playQuestions.length} preguntas</span><span>{activity.timerMode==="none"?"Sin límite":activity.timerMode==="down"?"Tiempo: "+fmt(remaining||0):"Cronómetro listo"}</span></div><button className="tg-primary" onClick={()=>setScreen("play")}>Comenzar concurso</button></section></main>;
 if(screen==="login")return <main className="tg-page"><header className="tg-header"><a href={previewMode?"./?panel=actividades":"./"}>{previewMode?"← Volver a Mis actividades":"Aula en juego"}</a></header><form className="tg-login" onSubmit={studentLogin}><span className="tg-kicker">{previewMode?"VISTA PREVIA · NO GUARDA CALIFICACIONES":title.toUpperCase()}</span><h1>{activity.title||title}</h1>{previewMode?<><p>Prueba el juego como si fueras alumno. El resultado solo aparecerá en esta pantalla y no se guardará.</p><button type="button" className="tg-primary" disabled={busy} onClick={()=>void start()}>{busy?"Preparando…":"Probar actividad"}</button></>:student&&studentToken?<><p>Hola, {student.givenNames} {student.paternalSurname}. Tu sesión sigue activa.</p><button type="button" className="tg-primary" disabled={busy} onClick={()=>void start()}>{busy?"Preparando…":"Comenzar actividad"}</button><button type="button" onClick={()=>{clearStudentSession();setStudent(null);setStudentToken("")}}>Cambiar de alumno</button></>:<><p>Ingresa con tu cuenta de alumno para comenzar.</p><label>Usuario<input required autoComplete="username" value={credentials.username} onChange={e=>setCredentials({...credentials,username:e.target.value})}/></label><label>Contraseña<PasswordField required autoComplete="current-password" value={credentials.password} onChange={e=>setCredentials({...credentials,password:e.target.value})}/></label><button className="tg-primary" disabled={busy}>{busy?"Validando…":"Entrar y comenzar"}</button></>}{notice&&<p className="tg-notice">{notice}</p>}</form></main>;

 if(screen==="play")return <main className="tg-page"><FocusBlurGuard enabled={activity.blurWhenInactive===true} active={screen==="play"}/><header className="tg-play-head"><a href="./">Aula en juego</a><span>{activity.timerMode==="none"?"Sin límite":timerText}</span><small>{attempts===null?"Intentos ilimitados":"Intentos restantes: "+attempts}</small></header><section className="tg-play-shell"><span className="tg-kicker">{title.toUpperCase()}</span><h1>{activity.title}</h1><p>{activity.instructions}</p>
 {isQuestionGame&&<div className={"tg-play-questions"+(kind==="quiz-show"?" tg-contest-questions":"")}>{playQuestions.map((q,index)=><article className="tg-question-card" key={q.id}><span className="tg-question-count">Pregunta {index+1} de {playQuestions.length}</span><h2>{q.prompt}</h2>{(q.imageUrl||q.imageData)&&<img className="tg-question-image" src={q.imageData||q.imageUrl||""} alt="Imagen de la pregunta"/>}<div className={"tg-answer-grid"+(isTrueFalse?" tg-true-false":"")}>{q.options.map((option,j)=><button key={option.id} className={(answers[q.id]===option.id?"chosen ":"")+(isTrueFalse?(option.text==="Verdadero"?"tg-true":"tg-false"):"")} onClick={()=>setAnswers({...answers,[q.id]:option.id})}>{(option.imageData||option.imageUrl)&&<img src={option.imageData||option.imageUrl||""} alt=""/>}<span>{!isTrueFalse?`${String.fromCharCode(65+j)}. `:""}{option.text}</span></button>)}</div></article>)}</div>}
 {kind==="group-sort"&&<div className="tg-sort-game"><div className="tg-groups">{(activity.groups||[]).map(group=><section key={group.id} style={{borderTopColor:group.color}}><h2>{group.title}</h2><div>{playItems.filter(item=>answers[item.id]===group.id).map(item=><span key={item.id}>{item.text}</span>)}</div></section>)}</div><div className="tg-sort-items"><h2>Elige un elemento y después su grupo</h2>{playItems.map(item=>{const chosen=answers[item.id];return <article key={item.id} className={chosen?"sorted":""}>{(item.imageUrl||item.imageData)&&<img src={item.imageData||item.imageUrl||""} alt=""/>}<strong>{item.text}</strong><div>{(activity.groups||[]).map(group=><button key={group.id} className={chosen===group.id?"chosen":""} onClick={()=>setAnswers({...answers,[item.id]:group.id})}>{group.title}</button>)}</div></article>})}</div></div>}
 {kind==="sequence"&&<div className="tg-sequence">{order.map((step,index)=><article key={step.id}><span>{index+1}</span>{(step.imageUrl||step.imageData)&&<img src={step.imageData||step.imageUrl||""} alt=""/>}<strong>{step.text}</strong><div><button aria-label="Subir paso" disabled={index===0} onClick={()=>moveStep(index,-1)}>↑</button><button aria-label="Bajar paso" disabled={index===order.length-1} onClick={()=>moveStep(index,1)}>↓</button></div></article>)}</div>}
 {notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary tg-finish" disabled={busy} onClick={()=>void finish()}>{busy?"Guardando…":"Terminar y calificar"}</button></section></main>;

 if(screen==="result")return <main className="tg-page"><section className="tg-result"><span className="tg-kicker">{previewMode?"PRUEBA DOCENTE · NO REGISTRADA":"RESULTADO"}</span><h1>{score?.timedOut?"Se acabó el tiempo":"Actividad terminada"}</h1><div className="tg-grade">{score?.grade??0}<small> / 10</small></div><p>{score?.correct??0} de {score?.total??playTotal} respuestas correctas.</p><p>Tiempo: {fmt(score?.elapsedSeconds??seconds)}{score?.remainingSeconds!==null&&score?.remainingSeconds!==undefined?" · Te sobraron "+fmt(score.remainingSeconds):""}</p>{!previewMode&&<div className="tg-notice">{score?.attemptsRemaining===null?"Intentos ilimitados.":score?.attemptsRemaining===1?"Te queda 1 intento.":"Te quedan "+(score?.attemptsRemaining??0)+" intentos."}</div>}{!previewMode&&activity.showAnswersAtEnd&&<ActivityAnswerKey activity={activity}/ >}{!previewMode&&activity.showLeaderboard&&<ActivityLeaderboard rows={leaderboard}/ >}{!previewMode&&score&&(score.attemptsRemaining===null||score.attemptsRemaining>0)&&<button className="tg-primary" onClick={()=>{setScreen("login");setScore(null)}}>Intentar de nuevo</button>}{previewMode&&<button className="tg-primary" onClick={()=>{setScreen("login");setScore(null)}}>Probar de nuevo</button>}<a href={previewMode?"./?panel=actividades":"./?panel=alumno"}>{previewMode?"Volver a Mis actividades":"Volver al panel"}</a></section></main>;
 return <main className="tg-page" aria-live="polite"><section className="tg-login"><h1>Abriendo actividad…</h1><p>{notice||"Espera mientras cargamos el contenido."}</p></section></main>;
}
