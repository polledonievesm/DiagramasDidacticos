import "./home-gate.css";

export default function HomeGate() {
  return <main className="home-gate">
    <header className="hg-header"><a className="hg-brand" href="./"><span>A</span>Aula en juego</a></header>
    <section className="hg-content">
      <span className="hg-kicker">PLATAFORMA DE ACTIVIDADES</span>
      <h1>¿Cómo quieres ingresar?</h1>
      <p>Elige tu espacio para continuar.</p>
      <div className="hg-options">
        <a href="?panel=actividades" className="hg-option hg-teacher"><span className="hg-icon" aria-hidden="true">✎</span><span><strong>Entrar como maestro</strong><small>Crear actividades, ver resultados y administrar alumnos.</small></span><b aria-hidden="true">→</b></a>
        <a href="?panel=alumno" className="hg-option hg-student"><span className="hg-icon" aria-hidden="true">★</span><span><strong>Entrar como alumno</strong><small>Consultar las actividades asignadas y tus calificaciones.</small></span><b aria-hidden="true">→</b></a>
      </div>
    </section>
  </main>;
}
