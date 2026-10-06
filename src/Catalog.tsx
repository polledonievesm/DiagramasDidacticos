import { useMemo, useState } from "react";
import { defaultActivity } from "./default-activity";

const games = [
  { id:"diagram", title:"Diagrama con etiquetas", kind:"Observa y señala", description:"Coloca cada chincheta en la parte correcta de una imagen.", ready:true },
  { id:"pairs", title:"Une su pareja", kind:"Relaciona conceptos", description:"Arrastra cada palabra junto a la imagen o definición que le corresponde.", ready:true },
];

export default function Catalog() {
  const [search,setSearch]=useState("");
  const matches=useMemo(()=>games.filter(g=>(g.title+" "+g.kind+" "+g.description).toLocaleLowerCase("es-MX").includes(search.trim().toLocaleLowerCase("es-MX"))),[search]);
  return <main className="catalog-page">
    <header className="catalog-header"><a className="catalog-brand" href="./"><span className="catalog-mark">A</span>Aula en juego</a><nav><a href="#juegos">Juegos</a><a className="catalog-teacher" href="?juego=parejas&modo=maestro">Acceso del maestro</a></nav></header>
    <div className="catalog-main">
      <section className="catalog-hero"><div><span className="catalog-eyebrow">UN ESPACIO PARA APRENDER JUGANDO</span><h1>Los temas de clase, en una forma nueva.</h1><p>Elige una actividad breve, practica a tu ritmo y descubre cuánto puedes aprender mientras juegas.</p><a className="catalog-cta" href="#juegos">Explorar juegos <span aria-hidden="true">↓</span></a></div>
        <div className="catalog-art" aria-hidden="true"><span className="catalog-art-note">Ideas que conectan</span><div className="catalog-art-board"><div className="catalog-mini-card"><div className="catalog-mini-image"><i className="d1"/><i className="d2"/><i className="d3"/></div><div className="catalog-mini-caption">Observa <small>1 · 2 · 3</small></div></div><div className="catalog-mini-card catalog-mini-pairs"><div>Palabra <b>↔</b></div><div>Imagen <b>↔</b></div><div>Idea <b>↔</b></div></div></div></div></section>
      <section className="catalog-section" id="juegos"><div className="catalog-section-head"><div><span className="catalog-eyebrow">PARA TUS CLASES</span><h2>Elige un juego</h2></div><p>Actividades para practicar y recordar.</p></div>
        <label className="catalog-search">Buscar actividad<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Escribe el nombre de un juego"/></label>
        <div className="catalog-grid">{matches.map(g=>g.ready?<a className="catalog-card" key={g.id} href={g.id==="pairs"?"./?juego=parejas":"./?actividad="+encodeURIComponent(defaultActivity.id)}><div className="catalog-visual"><div className="diagram-icon"><b/><b/><b/></div></div><div className="catalog-card-content"><span className="catalog-card-kicker">{g.kind}</span><h3>{g.title}</h3><p>{g.description}</p><strong>Abrir juego <span>→</span></strong></div></a>:<article className="catalog-card catalog-soon" key={g.id}><div className="catalog-visual"><div className="pairs-icon"><i>A</i><i>1</i><i>●</i><i>↔</i></div></div><div className="catalog-card-content"><span className="catalog-card-kicker">{g.kind} · PRÓXIMAMENTE</span><h3>{g.title}</h3><p>{g.description}</p><strong>En preparación</strong></div></article>)}{!matches.length&&<p className="catalog-empty">No encontré un juego con ese nombre.</p>}</div>
      </section>
      <section className="catalog-how"><span className="catalog-eyebrow">FÁCIL DE USAR</span><h2>En tres pasos</h2><div className="catalog-steps"><article><b>01</b><strong>Elige</strong><span>Abre el juego para tu clase.</span></article><article><b>02</b><strong>Participa</strong><span>Resuelve desde el celular o computadora.</span></article><article><b>03</b><strong>Revisa</strong><span>Consulta tu resultado y sigue practicando.</span></article></div></section>
      <footer className="catalog-footer"><span>Aula en juego · Actividades para aprender a tu ritmo</span><a href="?juego=parejas&modo=maestro">Panel del maestro</a></footer>
    </div>
  </main>;
}
