import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PairGame from "./PairGame";
import ActivityManager from "./ActivityManager";
import TemplateGame from "./TemplateGame";
import "./globals.css";

const query=new URLSearchParams(window.location.search);
const game=query.get("juego")||"";
const generic=["quiz","group-sort","sequence"].includes(game);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {query.get("panel")==="actividades" ? <ActivityManager /> : game==="parejas" ? <PairGame /> : generic ? <TemplateGame kind={game as "quiz"|"group-sort"|"sequence"} /> : <App />}
  </React.StrictMode>,
);
