"use client";
import { useEffect, useState } from "react";
export default function ExperienceTools() {
  const [dark, setDark] = useState(false),
    [guide, setGuide] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("irtra-theme") === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
    if (!localStorage.getItem("irtra-guide-seen")) setGuide(true);
  }, []);
  function theme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("irtra-theme", next ? "dark" : "light");
  }
  function closeGuide() {
    setGuide(false);
    localStorage.setItem("irtra-guide-seen", "true");
  }
  return (
    <>
      <form className="global-search" action="/encuestas">
        <label className="sr-only" htmlFor="global-search">
          Buscar en IRTRA ENCUESTAS
        </label>
        <input id="global-search" name="q" placeholder="Buscar encuesta…" />
        <button aria-label="Buscar">⌕</button>
      </form>
      <button
        className="icon-tool"
        onClick={theme}
        title={dark ? "Usar tema claro" : "Usar tema oscuro"}
        aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"}
      >
        {dark ? "☀" : "◐"}
      </button>
      <button
        className="icon-tool"
        onClick={() => setGuide(true)}
        title="Guía rápida"
        aria-label="Abrir guía rápida"
      >
        i
      </button>
      {guide && (
        <div className="guide-backdrop">
          <section
            className="guide-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
          >
            <div className="guide-icon">IRTRA</div>
            <h2 id="guide-title">Bienvenido a IRTRA ENCUESTAS</h2>
            <p>
              Convierte cada encuesta en una decisión y una acción verificable.
            </p>
            <ol>
              <li>
                <b>Escanear o cargar</b> recibe y analiza los documentos.
              </li>
              <li>
                <b>Revisar pendientes</b> permite validar la lectura de la IA.
              </li>
              <li>
                <b>Inicio</b> muestra indicadores, riesgos y recomendaciones.
              </li>
              <li>
                <b>Planes de acción</b> asigna responsables y documenta
                resultados.
              </li>
              <li>
                <b>Soporte ATLAS</b> explica cualquier procedimiento del
                sistema.
              </li>
            </ol>
            <button className="btn" onClick={closeGuide}>
              Comenzar
            </button>
          </section>
        </div>
      )}
    </>
  );
}
