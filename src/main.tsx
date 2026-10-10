import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PairGame from "./PairGame";
import ActivityManager from "./ActivityManager";
import TemplateGame from "./TemplateGame";
import CardGame from "./CardGame";
import TextGame from "./TextGame";
import ExtraGame from "./ExtraGame";
import StudentPortal from "./StudentPortal";
import HomeGate from "./HomeGate";
import CrosswordGame from "./CrosswordGame";
import { getSessionRole, sessionChangedEventName } from "./gas-client";
import "./globals.css";
import "./redesign.css";

const query=new URLSearchParams(window.location.search);
const game=query.get("juego")||"";
const generic=["quiz","quiz-show","true-false","group-sort","sequence"].includes(game);
const cards=["flashcards","memory"].includes(game);
const textGames=["complete-sentence","word-order"].includes(game);
const extraGames=["roulette","word-search","complete-phrase"].includes(game);

function SessionEntry() {
  const [role, setRole] = useState(getSessionRole);
  useEffect(() => {
    const refresh = () => setRole(getSessionRole());
    window.addEventListener("storage", refresh);
    window.addEventListener(sessionChangedEventName(), refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(sessionChangedEventName(), refresh);
    };
  }, []);
  if (role === "student") return <StudentPortal />;
  if (role === "teacher") return <ActivityManager />;
  return <HomeGate />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {query.get("panel") === "alumno" ? <StudentPortal />
      : query.get("panel") === "alumnos" || (query.get("modo") === "maestro" && query.get("tab") === "students") ? <App />
      : ["actividades", "resultados"].includes(query.get("panel") || "") || (query.get("modo") === "maestro" && !query.get("actividad") && !query.get("nueva") && !query.get("juego")) ? <ActivityManager />
      : game === "crossword" ? <CrosswordGame />
      : game === "parejas" ? <PairGame />
      : generic ? <TemplateGame kind={game as "quiz" | "quiz-show" | "true-false" | "group-sort" | "sequence"} />
      : cards ? <CardGame kind={game as "flashcards" | "memory"} />
      : textGames ? <TextGame kind={game as "complete-sentence" | "word-order"} />
      : extraGames ? <ExtraGame kind={game as "roulette" | "word-search" | "complete-phrase"} />
      : query.get("actividad") ? <App />
      : query.get("panel") === "inicio" ? <HomeGate />
      : query.get("modo") === "maestro" ? <App />
      : <SessionEntry />}
  </React.StrictMode>,
);
