import { useEffect, useMemo, useState } from "react";
import { templateRegistry } from "./template-registry";
import { apiRequest, forgetTeacherKey, getTeacherKey } from "./gas-client";

export default function Catalog() {
  const [search, setSearch] = useState("");
  const [supportedKinds, setSupportedKinds] = useState<string[]>(["diagram", "pairs"]);
  const [teacher, setTeacher] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setTeacher(Boolean(getTeacherKey()));
    let live = true;
    void apiRequest("/api/capabilities").then(async response => {
      const data = await response.json();
      if (live && response.ok && Array.isArray(data.kinds)) setSupportedKinds(data.kinds);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const matches = useMemo(() => templateRegistry.filter(game =>
    (game.title + " " + game.kind + " " + game.description)
      .toLocaleLowerCase("es-MX").includes(search.trim().toLocaleLowerCase("es-MX"))), [search]);

  function signOut() {
    forgetTeacherKey();
    setTeacher(false);
    setAccountOpen(false);
  }

  return <main className="catalog-page">
    <header className="catalog-header">
      <a className="catalog-brand" href="./"><span className="catalog-mark">A</span>Aula en juego</a>
      <nav className="catalog-nav" aria-label="Navegación principal">
        <a href="?panel=actividades">Mis actividades</a>
        <a href="?panel=resultados">Mis resultados</a>
        <a href="?panel=alumno">Portal del alumno</a>
        <a className="catalog-create-link" href="?panel=actividades&seccion=crear">Crear actividad <span aria-hidden="true">＋</span></a>
        <div className="catalog-account">
          <button type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>{teacher ? "Docente" : "Cuenta"}<span aria-hidden="true">⌄</span></button>
          {accountOpen && <div className="catalog-account-menu">
            {teacher ? <><strong>Sesión docente</strong><button type="button" onClick={signOut}>Cerrar sesión</button></> : <a href="?panel=actividades">Acceso del maestro</a>}
          </div>}
        </div>
      </nav>
    </header>
    <div className="catalog-main">
      <section className="catalog-section" id="juegos" aria-labelledby="games-title">
        <div className="catalog-section-head"><div><span className="catalog-eyebrow">AULA EN JUEGO</span><h1 id="games-title">Elige una actividad</h1></div><p>Actividades listas para practicar en clase.</p></div>
        <label className="catalog-search">Buscar actividad<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Escribe el nombre de un juego" /></label>
        <div className="catalog-grid">{matches.map(game => {
          const serverKind = game.id === "diagram-labels" ? "diagram" : game.id;
          const ready = game.status === "ready" && supportedKinds.includes(serverKind);
          const href = game.id === "diagram-labels" ? "./?modo=maestro&nueva=1" : "./?juego=" + (game.id === "pairs" ? "parejas" : game.id) + "&modo=maestro&nueva=1";
          return ready
            ? <a className="catalog-card" key={game.id} href={href}>
                <div className="catalog-visual" aria-hidden="true">{game.id === "diagram-labels" ? <div className="diagram-icon"><b/><b/><b/></div> : <div className="pairs-icon"><i>A</i><i>1</i><i>●</i><i>↔</i></div>}</div>
                <div className="catalog-card-content"><span className="catalog-card-kicker">{game.kind}</span><h2>{game.title}</h2><p>{game.description}</p><strong>Crear actividad <span aria-hidden="true">→</span></strong></div>
              </a>
            : <article className="catalog-card catalog-soon" key={game.id} aria-label={game.title + ", en preparación"}>
                <div className="catalog-visual" aria-hidden="true"><div className="pairs-icon"><i>···</i><i>?</i><i>✦</i><i>↔</i></div></div>
                <div className="catalog-card-content"><span className="catalog-card-kicker">EN PREPARACIÓN</span><h2>{game.title}</h2><p>{game.description}</p><strong>Próximamente</strong></div>
              </article>;
        })}{!matches.length && <p className="catalog-empty">No encontré un juego con ese nombre.</p>}</div>
      </section>
      <footer className="catalog-footer"><span>Aula en juego</span><a href="?panel=actividades">Espacio del docente</a></footer>
    </div>
  </main>;
}
