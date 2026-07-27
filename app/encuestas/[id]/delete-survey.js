"use client";
import { useState } from "react";

export default function DeleteSurvey({ id, role, request }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  async function act(action) {
    if (reason.trim().length < 5) {
      setMsg("Indique un motivo de al menos 5 caracteres.");
      return;
    }
    const labels = { request: "enviar la solicitud", approve: "aprobar y eliminar definitivamente", reject: "rechazar la solicitud" };
    if (!confirm(`¿Desea ${labels[action]}?`)) return;
    const response = await fetch(`/api/surveys/${id}/deletion`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const result = await response.json();
    if (response.ok) {
      if (action === "approve") location.href = "/encuestas";
      else location.reload();
    } else setMsg(result.error);
  }

  if (request) return (
    <div className="card" style={{ marginTop: 18, borderColor: "#d99b37" }}>
      <h3>Eliminación pendiente de aprobación</h3>
      <p><b>{request.requester_name}</b> solicitó eliminar esta encuesta.</p>
      <p><b>Motivo:</b> {request.reason}</p>
      {role === "admin" ? (
        <>
          <textarea className="input" style={{ width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la decisión" />
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn" style={{ background: "#b72f2f" }} onClick={() => act("approve")}>Aprobar y eliminar</button>
            <button className="btn secondary" onClick={() => act("reject")}>Rechazar solicitud</button>
          </div>
        </>
      ) : <p className="muted">Un Administrador debe aprobar o rechazar esta solicitud.</p>}
      {msg && <p className="notice">{msg}</p>}
    </div>
  );

  return (
    <div style={{ marginTop: 18 }}>
      {!open ? <button className="btn secondary" onClick={() => setOpen(true)}>Solicitar eliminación</button> : (
        <div className="card">
          <h3>Solicitar eliminación</h3>
          <p>La encuesta no se eliminará hasta que un Administrador apruebe la solicitud.</p>
          <textarea className="input" style={{ width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo obligatorio" />
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => act("request")}>Enviar solicitud</button>
            <button className="btn secondary" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
          {msg && <p className="notice">{msg}</p>}
        </div>
      )}
    </div>
  );
}
