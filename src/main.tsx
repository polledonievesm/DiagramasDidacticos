import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PairGame from "./PairGame";
import ActivityManager from "./ActivityManager";
import TemplateGame from "./TemplateGame";
import CardGame from "./CardGame";
import TextGame from "./TextGame";
import ExtraGame from "./ExtraGame";
import "./globals.css";

const query=new URLSearchParams(window.location.search);
const game=query.get("juego")||"";
const generic=["quiz","quiz-show","true-false","group-sort","sequence"].includes(game);
const cards=["flashcards","memory"].includes(game);
const textGames=["complete-sentence","word-order"].includes(game);
const extraGames=["roulette","word-search","complete-phrase"].includes(game);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {["actividades","resultados"].includes(query.get("panel")||"") ? <ActivityManager /> : game==="parejas" ? <PairGame /> : generic ? <TemplateGame kind={game as "quiz"|"quiz-show"|"true-false"|"group-sort"|"sequence"} /> : cards ? <CardGame kind={game as "flashcards"|"memory"} /> : textGames ? <TextGame kind={game as "complete-sentence"|"word-order"} /> : extraGames ? <ExtraGame kind={game as "roulette"|"word-search"|"complete-phrase"} /> : <App />}
  </React.StrictMode>,
);
