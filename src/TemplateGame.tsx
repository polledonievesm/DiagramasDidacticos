import { useEffect, useState } from "react";
import type { Activity, ActivityKind, QuizQuestion, SortItem, SequenceStep } from "./default-activity";
import { apiRequest } from "./gas-client";
import "./template-game.css";

type Student = { paternalSurname:string; maternalSurname:string; givenNames:string };
type Props = { kind: "quiz" | "group-sort" | "sequence" };
type Score = { correct:number; total:number; grade:number; elapsedSeconds:number; remainingSeconds:number|null; timedOut:boolean; attemptsRemaining:number|null };
const colors=["#43866e","#b9654f","#667eb1","#ac8e3d","#7f6caa"];
const id=()=>crypto.randomUUID();
const blank=(kind:Props["kind"]):Activity=>({
 id:"",kind,title:"",instructions:kind==="quiz"?"Elige la respuesta correcta.":kind==="group-sort"?"Coloca cada elemento en el grupo que corresponde.":"Ordena los pasos de la actividad.",
 timerMode:"none",timeLimitSeconds:180,maxAttempts:3,imageUrl:"",labels:[],shuffle:true,sound:true,scoring:true,
 questions:kind==="quiz"?[{id:id(),prompt:"",options:[{id:id(),text:""},{id:id(),text:""}],correctOptionId:""}]:[],
 groups:kind==="group-sort"?[{id:id(),title:"Grupo 1",color:colors[0]},{id:id(),title:"Grupo 2",color:colors[1]}]:[],
 items:kind==="group-sort"?[{id:id(),text:"",groupId:""},{id:id(),text:"",groupId:""},{id:id(),text:"",groupId:""}]:[],
 steps:kind==="sequence"?[{id:id(),text:"",order:0},{id:id(),text:"",order:1},{id:id(),text:"",order:2}]:[],
});
const fmt=(value:number)=>{const n=Math.max(0,Math.floor(value));return Math.floor(n/60)+":"+String(n%60).padStart(2,"0")};
function randomize<T>(items:T[]){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function readImage(file?:File){return new Promise<string>((resolve,reject)=>{if(!file)return resolve("");if(file.size>5*1024*1024)return reject(Error("La imagen debe pesar menos de 5 MB."));if(!/^image\/(png|jpeg|webp)$/.test(file.type))return reject(Error("Usa una imagen PNG, JPG o WebP."));const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("No se pudo leer la imagen."));reader.readAsDataURL(file)})}

export default function TemplateGame({kind}:Props){
 const [screen,setScreen]=useState<"loading"|"teacher-key"|"teacher"|"login"|"play"|"result">("loading");
 const [activity,setActivity]=useState<Activity>(()=>blank(kind));
 const [draft,setDraft]=useState<Activity>(()=>blank(kind));
 const [teacherKey,setTeacherKey]=useState(sessionStorage.getItem("platformTeacherKey")||"");
 const [keyDraft,setKeyDraft]=useState("");
 const [student,setStudent]=useState<Student|null>(null);
 const [studentToken,setStudentToken]=useState("");
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
 const title=kind==="quiz"?"Cuestionario":kind==="group-sort"?"Clasificar en grupos":"Ordenar secuencias";
 const playTotal=kind==="quiz"?activity.questions?.length||0:kind==="group-sort"?activity.items?.length||0:activity.steps?.length||0;
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
   const key=sessionStorage.getItem("platformTeacherKey")||sessionStorage.getItem("diagramTeacherKey")||"";
   if(!key){setScreen("teacher-key");return}
   setTeacherKey(key);
   void getTeacherActivities(key).then(async()=>{
    const savedId=q.get("actividad");
    if(savedId)await loadSaved(savedId);
    else if(q.get("nueva")==="1"){const fresh=blank(kind);setDraft(fresh);setActivity(fresh)}
    setScreen("teacher")
   }).catch(e=>{sessionStorage.removeItem("platformTeacherKey");sessionStorage.removeItem("diagramTeacherKey");setNotice(e instanceof Error?e.message:"No se pudo cargar el editor.");setScreen("teacher-key")});
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
  try{await getTeacherActivities(keyDraft);setTeacherKey(keyDraft);sessionStorage.setItem("platformTeacherKey",keyDraft);sessionStorage.setItem("diagramTeacherKey",keyDraft);sessionStorage.setItem("pairTeacherKey",keyDraft);const q=new URLSearchParams(location.search);if(q.get("actividad"))await loadSaved(q.get("actividad")!);else if(q.get("nueva")==="1"){const fresh=blank(kind);setActivity(fresh);setDraft(fresh)}setScreen("teacher")}
  catch(e){setNotice(e instanceof Error?e.message:"No se pudo validar la clave.")}
  finally{setBusy(false)}
 }
 async function save(event:React.FormEvent){
  event.preventDefault();setBusy(true);setNotice("");
  try{
   const payload={...draft,id:draft.id||"actividad-"+id(),kind,labels:[],pairs:[]};
   if(kind==="quiz"&&(!payload.questions?.length||payload.questions.some(q=>!q.prompt.trim()||q.options.length<2||q.options.some(o=>!o.text.trim())||!q.options.some(o=>o.id===q.correctOptionId))))throw Error("Completa cada pregunta, sus opciones y marca una respuesta correcta.");
   if(kind==="group-sort"&&((payload.groups?.length||0)<2||!payload.items?.length||payload.items.some(item=>!item.text.trim()||!payload.groups?.some(g=>g.id===item.groupId))))throw Error("Completa los grupos y asigna cada elemento a uno.");
   if(kind==="sequence"&&((payload.steps?.length||0)<2||payload.steps?.some(step=>!step.text.trim())))throw Error("Escribe al menos dos pasos.");
   const response=await apiRequest("/api/teacher/activity",{method:"POST",headers:{"x-teacher-key":teacherKey},body:JSON.stringify(payload)}),data=await response.json();
   if(!response.ok)throw Error(data.error||"No se pudo guardar.");
   setActivity(data);setDraft(data);await getTeacherActivities(teacherKey);setNotice("Actividad guardada. Ya puedes compartir su enlace.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar la actividad.")}
  finally{setBusy(false)}
 }
 async function start(profile:Student|null=student,token=studentToken){
  if(!activity.id||!profile||!token)return;
  setBusy(true);setNotice("");
  try{
   const query=new URLSearchParams({activityId:activity.id,studentToken:token,paternalSurname:profile.paternalSurname,maternalSurname:profile.maternalSurname,givenNames:profile.givenNames});
   const response=await apiRequest("/api/attempts?"+query),data=await response.json();
   if(!response.ok||!data.canStart)throw Error(data.error||"Ya no tienes intentos.");
   setAttempts(data.remaining===null?null:Number(data.remaining));setRemaining(activity.timerMode==="down"?activity.timeLimitSeconds:null);setSeconds(0);setTimedOut(false);setAnswers({});
   if(kind==="quiz")setPlayQuestions((activity.shuffle===false?[...(activity.questions||[])]:randomize(activity.questions||[])).map(q=>({...q,options:activity.shuffle===false?[...q.options]:randomize(q.options)})));
   if(kind==="group-sort")setPlayItems(activity.shuffle===false?[...(activity.items||[])]:randomize(activity.items||[]));
   if(kind==="sequence")setOrder(activity.shuffle===false?[...(activity.steps||[])]:randomize(activity.steps||[]));
   setScreen("play");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo iniciar.")}
  finally{setBusy(false)}
 }
 async function studentLogin(event:React.FormEvent){
  event.preventDefault();setBusy(true);setNotice("");
  try{
   const response=await apiRequest("/api/student/login",{method:"POST",body:JSON.stringify(credentials)}),data=await response.json();
   if(!response.ok)throw Error(data.error||"Usuario o contraseña incorrectos.");
   setStudent(data.student);setStudentToken(data.token);setCredentials({username:"",password:""});setBusy(false);
   await start(data.student,data.token);
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo iniciar sesión.");setBusy(false)}
 }
 async function finish(expired=false){
  if(!activity.id||!student||busy)return;
  setBusy(true);setNotice("");
  try{
   const answerPayload=kind==="sequence"?{order:order.map(step=>step.id)}:answers;
   const response=await apiRequest("/api/submit",{method:"POST",body:JSON.stringify({activityId:activity.id,studentToken,paternalSurname:student.paternalSurname,maternalSurname:student.maternalSurname,givenNames:student.givenNames,answers:answerPayload,elapsedSeconds:seconds,remainingSeconds:activity.timerMode==="down"?Math.max(0,activity.timeLimitSeconds-seconds):null,timedOut:expired||timedOut})}),data=await response.json();
   if(!response.ok)throw Error(data.error||"No se pudo guardar el resultado.");
   setScore(data);setAttempts(data.attemptsRemaining===null?null:Number(data.attemptsRemaining));setScreen("result");
   if(activity.sound!==false&&!muted)beep();
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo calificar.");setTimedOut(false)}
  finally{setBusy(false)}
 }
 useEffect(()=>{if(timedOut&&screen==="play")void finish(true)},[timedOut]);
 function beep(){try{const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=660;gain.gain.value=.04;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.22);osc.onended=()=>void ctx.close()}catch{}}
 function moveStep(index:number,offset:number){const next=[...order],to=index+offset;if(to<0||to>=next.length)return;[next[index],next[to]]=[next[to],next[index]];setOrder(next)}
 async function upload(file:File|undefined,done:(data:string)=>void){if(!file)return;try{const reader=new FileReader();reader.onload=()=>done(String(reader.result));reader.onerror=()=>setNotice("No se pudo leer la imagen.");if(file.size>5*1024*1024)throw Error("La imagen debe pesar menos de 5 MB.");if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error("Usa una imagen PNG, JPG o WebP.");reader.readAsDataURL(file)}catch(e){setNotice(e instanceof Error?e.message:"No se pudo leer la imagen.")}}

 function questionField(q:QuizQuestion,index:number){
  return <article className="tg-editor-row" key={q.id}>
   <header><strong>Pregunta {index+1}</strong><button type="button" onClick={()=>setDraft({...draft,questions:draft.questions!.filter(x=>x.id!==q.id)})} disabled={draft.questions!.length<=1}>Quitar</button></header>
   <label>Pregunta<input value={q.prompt} onChange={e=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,prompt:e.target.value}:x)})} placeholder="Escribe la pregunta"/></label>
   <label>Imagen opcional<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>upload(e.target.files?.[0],imageData=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,imageData,imageUrl:""}:x)}))}/></label>
   {q.imageData&&<img className="tg-preview-image" src={q.imageData} alt="Vista previa"/>}
   <div className="tg-options">{q.options.map((option,j)=><label key={option.id}><span>Opción {j+1}</span><input value={option.text} onChange={e=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,options:x.options.map(o=>o.id===option.id?{...o,text:e.target.value}:o)}:x)})}/><input type="radio" name={"correct-"+q.id} aria-label={"Marcar opción "+(j+1)+" correcta"} checked={q.correctOptionId===option.id} onChange={()=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,correctOptionId:option.id}:x)})}/></label>)}</div>
   <button type="button" className="tg-subtle" onClick={()=>setDraft({...draft,questions:draft.questions!.map(x=>x.id===q.id?{...x,options:[...x.options,{id:id(),text:""}]}:x)})} disabled={q.options.length>=5}>＋ Añadir opción</button>
  </article>;
 }

 if(screen==="teacher-key")return <main className="tg-page"><header className="tg-header"><a href="./">Aula en juego</a><a href="?panel=actividades">Mis actividades</a></header><form className="tg-login" onSubmit={teacherEnter}><span className="tg-kicker">EDITOR DE ACTIVIDAD · {title.toLocaleUpperCase("es-MX")}</span><h1>Acceso del maestro</h1><p>Ingresa la clave para crear o editar una actividad.</p><label>Clave del maestro<input type="password" required value={keyDraft} onChange={e=>setKeyDraft(e.target.value)}/></label>{notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary" disabled={busy}>{busy?"Conectando…":"Continuar al editor"}</button></form></main>;

 if(screen==="teacher")return <main className="tg-page"><header className="tg-header"><a href="./?panel=actividades">Mis actividades</a><span>{title}</span></header><section className="tg-shell"><div className="tg-title"><div><span className="tg-kicker">INTRODUCIR CONTENIDO</span><h1>{draft.title||"Nueva actividad"}</h1><p>Escribe el contenido. Los ajustes comunes se guardan junto a esta plantilla.</p></div><label>Abrir guardada<select value={activity.id||""} onChange={e=>{const found=activityList.find(a=>a.id===e.target.value);if(found){setDraft(found);setActivity(found)}}}><option value="">Actividad nueva</option>{activityList.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label></div>
 <form className="tg-form" onSubmit={save}><label className="tg-full">Título<input required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label className="tg-full">Instrucción para alumnos<input maxLength={240} value={draft.instructions} onChange={e=>setDraft({...draft,instructions:e.target.value})}/></label>
 {kind==="quiz"&&<section className="tg-full"><h2>Preguntas y opciones</h2>{(draft.questions||[]).map(questionField)}<button type="button" className="tg-add" onClick={()=>setDraft({...draft,questions:[...draft.questions!,{id:id(),prompt:"",options:[{id:id(),text:""},{id:id(),text:""}],correctOptionId:""}]})}>＋ Añadir pregunta</button></section>}
 {kind==="group-sort"&&<><section className="tg-full"><h2>Grupos</h2><div className="tg-groups">{(draft.groups||[]).map((group,index)=><label key={group.id}>Grupo {index+1}<input value={group.title} onChange={e=>setDraft({...draft,groups:draft.groups!.map(g=>g.id===group.id?{...g,title:e.target.value}:g)})}/></label>)}</div><button type="button" className="tg-subtle" onClick={()=>setDraft({...draft,groups:[...draft.groups!,{id:id(),title:"Nuevo grupo",color:colors[draft.groups!.length%colors.length]}]})} disabled={draft.groups!.length>=8}>＋ Añadir grupo</button></section><section className="tg-full"><h2>Elementos para clasificar</h2>{(draft.items||[]).map((item,index)=><article className="tg-editor-row" key={item.id}><header><strong>Elemento {index+1}</strong><button type="button" onClick={()=>setDraft({...draft,items:draft.items!.filter(x=>x.id!==item.id)})} disabled={draft.items!.length<=2}>Quitar</button></header><div className="tg-fields"><label>Texto<input value={item.text} onChange={e=>setDraft({...draft,items:draft.items!.map(x=>x.id===item.id?{...x,text:e.target.value}:x)})}/></label><label>Grupo correcto<select value={item.groupId} onChange={e=>setDraft({...draft,items:draft.items!.map(x=>x.id===item.id?{...x,groupId:e.target.value}:x)})}><option value="">Selecciona grupo</option>{draft.groups!.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label><label>Imagen opcional<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>upload(e.target.files?.[0],imageData=>setDraft({...draft,items:draft.items!.map(x=>x.id===item.id?{...x,imageData,imageUrl:""}:x)}))}/></label></div>{item.imageData&&<img className="tg-preview-image" src={item.imageData} alt="Vista previa"/>}</article>)}<button type="button" className="tg-add" onClick={()=>setDraft({...draft,items:[...draft.items!,{id:id(),text:"",groupId:draft.groups![0]?.id||"",imageData:""}]})}>＋ Añadir elemento</button></section></>}
 {kind==="sequence"&&<section className="tg-full"><h2>Pasos en el orden correcto</h2>{(draft.steps||[]).map((step,index)=><article className="tg-editor-row tg-fields" key={step.id}><strong>{index+1}.</strong><label>Paso<input value={step.text} onChange={e=>setDraft({...draft,steps:draft.steps!.map(x=>x.id===step.id?{...x,text:e.target.value}:x)})}/></label><label>Imagen opcional<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>upload(e.target.files?.[0],imageData=>setDraft({...draft,steps:draft.steps!.map(x=>x.id===step.id?{...x,imageData,imageUrl:""}:x)}))}/></label><button type="button" onClick={()=>setDraft({...draft,steps:draft.steps!.filter(x=>x.id!==step.id)})} disabled={draft.steps!.length<=2}>Quitar</button></article>)}<button type="button" className="tg-add" onClick={()=>setDraft({...draft,steps:[...draft.steps!,{id:id(),text:"",order:draft.steps!.length,imageData:""}]})}>＋ Añadir paso</button></section>}
 <section className="tg-full tg-options-common"><h2>Opciones</h2><label>Reloj<select value={draft.timerMode} onChange={e=>setDraft({...draft,timerMode:e.target.value as Activity["timerMode"]})}><option value="none">Sin límite</option><option value="up">Contar el tiempo</option><option value="down">Cuenta regresiva</option></select></label>{draft.timerMode==="down"&&<label>Duración (minutos)<input type="number" min="1" max="60" value={Math.round(draft.timeLimitSeconds/60)} onChange={e=>setDraft({...draft,timeLimitSeconds:Number(e.target.value)*60})}/></label>}<label>Intentos<select value={draft.maxAttempts===null?"infinite":draft.maxAttempts} onChange={e=>setDraft({...draft,maxAttempts:e.target.value==="infinite"?null:Number(e.target.value)})}><option value="infinite">Ilimitados</option>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label className="tg-check"><input type="checkbox" checked={draft.shuffle!==false} onChange={e=>setDraft({...draft,shuffle:e.target.checked})}/> Mezclar al iniciar</label><label className="tg-check"><input type="checkbox" checked={draft.sound!==false} onChange={e=>setDraft({...draft,sound:e.target.checked})}/> Sonidos</label></section>
 <div className="tg-save tg-full">{notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary" disabled={busy}>{busy?"Guardando…":"Guardar actividad"}</button>{activity.id&&<button type="button" className="tg-subtle" onClick={()=>navigator.clipboard.writeText(location.origin+location.pathname+"?juego="+kind+"&actividad="+encodeURIComponent(activity.id)).then(()=>setNotice("Enlace copiado."))}>Copiar enlace para alumnos</button>}</div>
 </form></section></main>;

 if(screen==="login")return <main className="tg-page"><header className="tg-header"><a href="./">Aula en juego</a></header><form className="tg-login" onSubmit={studentLogin}><span className="tg-kicker">{title.toUpperCase()}</span><h1>{activity.title||title}</h1><p>Ingresa con tu cuenta de alumno para comenzar.</p><label>Usuario<input required autoComplete="username" value={credentials.username} onChange={e=>setCredentials({...credentials,username:e.target.value})}/></label><label>Contraseña<input required type="password" autoComplete="current-password" value={credentials.password} onChange={e=>setCredentials({...credentials,password:e.target.value})}/></label>{notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary" disabled={busy}>{busy?"Validando…":"Entrar y comenzar"}</button></form></main>;

 if(screen==="play")return <main className="tg-page"><header className="tg-play-head"><a href="./">Aula en juego</a><span>{activity.timerMode==="none"?"Sin límite":timerText}</span><small>{attempts===null?"Intentos ilimitados":"Intentos restantes: "+attempts}</small></header><section className="tg-play-shell"><span className="tg-kicker">{title.toUpperCase()}</span><h1>{activity.title}</h1><p>{activity.instructions}</p>
 {kind==="quiz"&&<div className="tg-play-questions">{playQuestions.map((q,index)=><article className="tg-question-card" key={q.id}><h2>{index+1}. {q.prompt}</h2>{(q.imageUrl||q.imageData)&&<img className="tg-question-image" src={q.imageData||q.imageUrl||""} alt="Imagen de la pregunta"/>}<div className="tg-answer-grid">{q.options.map(option=><button key={option.id} className={answers[q.id]===option.id?"chosen":""} onClick={()=>setAnswers({...answers,[q.id]:option.id})}>{option.text}</button>)}</div></article>)}</div>}
 {kind==="group-sort"&&<div className="tg-sort-game"><div className="tg-groups">{(activity.groups||[]).map(group=><section key={group.id} style={{borderTopColor:group.color}}><h2>{group.title}</h2><div>{playItems.filter(item=>answers[item.id]===group.id).map(item=><span key={item.id}>{item.text}</span>)}</div></section>)}</div><div className="tg-sort-items"><h2>Elige un elemento y después su grupo</h2>{playItems.map(item=>{const chosen=answers[item.id];return <article key={item.id} className={chosen?"sorted":""}>{(item.imageUrl||item.imageData)&&<img src={item.imageData||item.imageUrl||""} alt=""/>}<strong>{item.text}</strong><div>{(activity.groups||[]).map(group=><button key={group.id} className={chosen===group.id?"chosen":""} onClick={()=>setAnswers({...answers,[item.id]:group.id})}>{group.title}</button>)}</div></article>})}</div></div>}
 {kind==="sequence"&&<div className="tg-sequence">{order.map((step,index)=><article key={step.id}><span>{index+1}</span>{(step.imageUrl||step.imageData)&&<img src={step.imageData||step.imageUrl||""} alt=""/>}<strong>{step.text}</strong><div><button aria-label="Subir paso" disabled={index===0} onClick={()=>moveStep(index,-1)}>↑</button><button aria-label="Bajar paso" disabled={index===order.length-1} onClick={()=>moveStep(index,1)}>↓</button></div></article>)}</div>}
 {notice&&<p className="tg-notice">{notice}</p>}<button className="tg-primary tg-finish" disabled={busy} onClick={()=>void finish()}>{busy?"Guardando…":"Terminar y calificar"}</button></section></main>;

 return <main className="tg-page"><section className="tg-result"><span className="tg-kicker">RESULTADO</span><h1>{score?.timedOut?"Se acabó el tiempo":"Actividad terminada"}</h1><div className="tg-grade">{score?.grade??0}<small> / 10</small></div><p>{score?.correct??0} de {score?.total??playTotal} respuestas correctas.</p><p>Tiempo: {fmt(score?.elapsedSeconds??seconds)}{score?.remainingSeconds!==null&&score?.remainingSeconds!==undefined?" · Te sobraron "+fmt(score.remainingSeconds):""}</p><div className="tg-notice">{score?.attemptsRemaining===null?"Intentos ilimitados.":score?.attemptsRemaining===1?"Te queda 1 intento.":"Te quedan "+(score?.attemptsRemaining??0)+" intentos."}</div>{score&&(score.attemptsRemaining===null||score.attemptsRemaining>0)&&<button className="tg-primary" onClick={()=>{setScreen("login");setStudent(null);setStudentToken("");setScore(null)}}>Intentar de nuevo</button>}<a href="./?panel=actividades">Volver al inicio</a></section></main>;
}
