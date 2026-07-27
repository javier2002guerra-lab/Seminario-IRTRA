"use client";
import { useState } from "react";
export default function FollowupForm({ record, assignees }) {
  const [msg, setMsg] = useState("");
  async function save(e) {
    e.preventDefault();
    const r = await fetch(`/api/surveys/${record.id}/followups`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    const j = await r.json();
    setMsg(r.ok ? "Seguimiento registrado." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  return (
    <form className="card" style={{ marginTop: 18 }} onSubmit={save}>
      <h3>Seguimiento del caso</h3>
      <div className="toolbar">
        <select className="input" name="status" defaultValue={record.status}>
          {[
            "Recibido",
            "En procesamiento",
            "Procesado",
            "Pendiente de revisión",
            "Asignado",
            "En atención",
            "Resuelto",
            "Cerrado",
            "Error",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="input"
          name="assignee"
          defaultValue={record.assignee_id || ""}
        >
          <option value="">Sin cambiar responsable</option>
          {assignees.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="input"
        style={{ width: "100%", marginBottom: 10 }}
        name="comment"
        placeholder="Comentario de seguimiento o resolución"
        required
      />
      <button className="btn">Registrar seguimiento</button>
      {msg && <p>{msg}</p>}
    </form>
  );
}
