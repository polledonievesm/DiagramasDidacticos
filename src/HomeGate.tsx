import { useState } from "react";
import { apiRequest, rememberTeacherKey, saveStudentSession } from "./gas-client";
import "./home-gate.css";

type Role = "student" | "teacher";

export default function HomeGate() {
  const [role, setRole] = useState<Role>("student");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const route = role === "teacher" ? "/api/teacher/login" : "/api/student/login";
      const response = await apiRequest(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Revisa tu usuario y contraseña.");
      if (role === "teacher") {
        if (!data.token) throw new Error("No se recibió la sesión docente. Inténtalo otra vez.");
        rememberTeacherKey(String(data.token), String(data.username || credentials.username));
        window.location.href = "?panel=actividades";
      } else {
        if (!data.token || !data.student) throw new Error("No se pudo validar la cuenta del alumno.");
        saveStudentSession(String(data.token), data.student);
        window.location.href = "?panel=alumno";
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
      setBusy(false);
    }
  }

  return <main className="home-gate">
    <div className="hg-orb hg-orb-one" aria-hidden="true" />
    <div className="hg-orb hg-orb-two" aria-hidden="true" />
    <header className="hg-header"><a className="hg-brand" href="./"><span>A</span>Aula en juego</a><span className="hg-header-note">Aprender también puede ser un juego</span></header>
    <section className="hg-layout">
      <div className="hg-welcome">
        <span className="hg-kicker">TU ESPACIO PARA APRENDER</span>
        <h1>Hola, qué gusto verte.</h1>
        <p>Entra a tus actividades y continúa aprendiendo a tu ritmo.</p>
        <div className="hg-scene" aria-hidden="true">
          <div className="hg-sun" />
          <div className="hg-book hg-book-back" />
          <div className="hg-book hg-book-front"><span>✦</span><i /><i /><i /></div>
          <div className="hg-leaf hg-leaf-left" /><div className="hg-leaf hg-leaf-right" />
          <span className="hg-scene-dot hg-dot-a" /><span className="hg-scene-dot hg-dot-b" />
        </div>
        <div className="hg-promise"><span>✓</span> Actividades preparadas por tu maestro</div>
      </div>
      <form className="hg-login-card" onSubmit={signIn}>
        <span className="hg-login-kicker">BIENVENIDO A AULA EN JUEGO</span>
        <h2>Iniciar sesión</h2>
        <p>Elige cómo vas a entrar.</p>
        <div className="hg-role-tabs" role="tablist" aria-label="Tipo de cuenta">
          <button type="button" role="tab" aria-selected={role === "student"} className={role === "student" ? "selected" : ""} onClick={() => { setRole("student"); setNotice(""); }}>Alumno</button>
          <button type="button" role="tab" aria-selected={role === "teacher"} className={role === "teacher" ? "selected" : ""} onClick={() => { setRole("teacher"); setNotice(""); }}>Maestro</button>
        </div>
        <label>Nombre de usuario<input autoComplete="username" value={credentials.username} onChange={event => setCredentials({ ...credentials, username: event.target.value })} required placeholder={role === "teacher" ? "Usuario docente" : "Usuario de tu tarjeta"} /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" value={credentials.password} onChange={event => setCredentials({ ...credentials, password: event.target.value })} required placeholder="Escribe tu contraseña" /></label>
        {notice && <p className="hg-notice" role="alert">{notice}</p>}
        <button className="hg-submit" disabled={busy}>{busy ? "Verificando…" : role === "teacher" ? "Entrar al espacio docente" : "Ver mis actividades"}<span aria-hidden="true">→</span></button>
        <small className="hg-help">{role === "teacher" ? "Usa la cuenta docente de la plataforma." : "Usa los datos de acceso que te entregó tu maestro."}</small>
      </form>
    </section>
    <footer className="hg-footer">Aula en juego <span>·</span> Un espacio amable para aprender</footer>
  </main>;
}
