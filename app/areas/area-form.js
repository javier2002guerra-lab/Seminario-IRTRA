"use client";
import { useState } from "react";
export default function AreaForm() {
  const [msg, setMsg] = useState("");
  async function save(e) {
    e.preventDefault();
    const r = await fetch("/api/admin/areas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    const j = await r.json();
    setMsg(r.ok ? "Área creada." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  return (
    <form className="card" onSubmit={save}>
      <h3>Nueva área</h3>
      {[
        ["name", "Nombre"],
        ["description", "Descripción"],
        ["owner", "Responsable"],
        ["contact", "Correo o contacto"],
      ].map(([n, p]) => (
        <input
          key={n}
          className="input"
          style={{ width: "100%", marginBottom: 9 }}
          name={n}
          placeholder={p}
          required={n === "name"}
        />
      ))}
      <p>
        <b>SLA por prioridad (horas)</b>
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        {[
          ["critical", 1],
          ["high", 4],
          ["medium", 24],
          ["low", 72],
          ["info", 120],
        ].map(([n, v]) => (
          <input
            className="input"
            style={{ minWidth: 0 }}
            type="number"
            name={n}
            defaultValue={v}
            min="1"
          />
        ))}
      </div>
      <button className="btn" style={{ marginTop: 14 }}>
        Guardar área
      </button>
      {msg && <p>{msg}</p>}
    </form>
  );
}
