import { useEffect, useState } from "react";

export default function FocusBlurGuard({ enabled, active }: { enabled: boolean; active: boolean }) {
  const [blurred, setBlurred] = useState(false);
  useEffect(() => {
    if (!enabled || !active) { document.body.classList.remove("game-focus-blurred"); setBlurred(false); return; }
    const update = () => {
      const next = document.hidden || !document.hasFocus();
      setBlurred(next);
      document.body.classList.toggle("game-focus-blurred", next);
    };
    window.addEventListener("blur", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.removeEventListener("blur", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      document.body.classList.remove("game-focus-blurred");
    };
  }, [enabled, active]);
  return enabled && active && blurred ? <div className="game-focus-notice" role="status">La actividad se difuminó porque saliste de la ventana. Regresa para continuar.</div> : null;
}
