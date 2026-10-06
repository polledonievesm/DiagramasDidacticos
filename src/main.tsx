import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PairGame from "./PairGame";
import ActivityManager from "./ActivityManager";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("panel") === "actividades" ? <ActivityManager /> : new URLSearchParams(window.location.search).get("juego") === "parejas" ? <PairGame /> : <App />}
  </React.StrictMode>,
);
