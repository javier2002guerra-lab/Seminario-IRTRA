"use client";
import { useState } from "react";
export default function Form({ record, areas, assigned = [] }) {
  const [msg, setMsg] = useState("");
  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      body = Object.fromEntries(fd);
    body.areas = fd.getAll("areas");
    const r = await fetch(`/api/surveys/${record.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    setMsg(r.ok ? "Clasificación guardada. Confirme la encuesta cuando termine la revisión." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 600);
  }
  return (
    <form className="card" onSubmit={save}>
      <h3>Validación humana</h3>
      <label>Clasificación</label>
      <select
        className="input"
        style={{ width: "100%", margin: "7px 0 13px" }}
        name="category"
        defaultValue={record.category}
      >
        {[
          "Queja",
          "Sugerencia",
          "Felicitación",
          "Mixta",
          "Sin observaciones",
        ].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <label>Prioridad</label>
      <select
        className="input"
        style={{ width: "100%", margin: "7px 0 13px" }}
        name="priority"
        defaultValue={record.priority}
      >
        {["Crítico", "Alto", "Medio", "Bajo", "Informativo"].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <label>Tema principal</label>
      <input
        className="input"
        style={{ width: "100%", margin: "7px 0 13px" }}
        name="primary_topic"
        defaultValue={record.primary_topic}
      />
      <label>Áreas responsables</label>
      <div style={{ margin: "7px 0 13px" }}>
        {areas.map((x) => (
          <label key={x.id} style={{ display: "block" }}>
            <input type="checkbox" name="areas" value={x.id} defaultChecked={assigned.includes(x.name)} /> {x.name}
          </label>
        ))}
      </div>
      <label>Resumen</label>
      <textarea
        className="input"
        style={{ width: "100%", margin: "7px 0 13px" }}
        name="summary"
        defaultValue={record.summary}
      />
      <label>Motivo obligatorio</label>
      <textarea
        className="input"
        style={{ width: "100%", margin: "7px 0 13px" }}
        name="reason"
        required
        minLength="5"
      />
      <button className="btn">Guardar clasificación</button>
      {msg && <p className="badge">{msg}</p>}
    </form>
  );
}
