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
const generic=["quiz","group-sort","sequence"].includes(game);
const cards=["flashcards","memory"].includes(game);
const textGames=["complete-sentence","word-order"].includes(game);
const extraGames=["roulette","word-search"].includes(game);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {query.get("panel")==="actividades" ? <ActivityManager /> : game==="parejas" ? <PairGame /> : generic ? <TemplateGame kind={game as "quiz"|"group-sort"|"sequence"} /> : cards ? <CardGame kind={game as "flashcards"|"memory"} /> : textGames ? <TextGame kind={game as "complete-sentence"|"word-order"} /> : extraGames ? <ExtraGame kind={game as "roulette"|"word-search"} /> : <App />}
  </React.StrictMode>,
);
