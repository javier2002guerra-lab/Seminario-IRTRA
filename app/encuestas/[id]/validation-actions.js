"use client";
import { useEffect, useRef, useState } from "react";

export default function ValidationActions({ record }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  async function act(action) {
    if (reason.trim().length < 5) return setMsg("Escriba un motivo de al menos 5 caracteres.");
    const response = await fetch(`/api/surveys/${record.id}/validation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const data = await response.json();
    setMsg(response.ok ? (action === "confirm" ? "Encuesta confirmada." : "Encuesta reabierta para revisión.") : data.error);
    if (response.ok) setTimeout(() => location.reload(), 600);
  }

  async function reanalyze() {
    if (reason.trim().length < 5) return setMsg("Escriba el motivo del reanálisis (al menos 5 caracteres).");
    if (!confirm("El nuevo análisis reemplazará la lectura automática y cualquier edición de esos campos. ¿Deseas continuar?")) return;
    setReanalyzing(true);
    setMsg("");
    setProgress(7);
    timer.current = setInterval(() => setProgress((value) => Math.min(92, value + (value < 55 ? 2 : 0.6))), 700);
    try {
      const response = await fetch(`/api/surveys/${record.id}/reanalyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : { error: "Respuesta vacía del servidor." };
      if (!response.ok) throw new Error(data.error || "No fue posible reanalizar.");
      setProgress(100);
      setMsg(`Reanálisis completado. Nueva confianza: ${Math.round(data.confidence * 100)}%.`);
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      setMsg(error.message);
      setProgress(0);
    } finally {
      clearInterval(timer.current);
      setReanalyzing(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>Validación humana</h3>
      <p><span className="badge">{record.validation_status}</span>{record.confirmed_at && <> · Confirmada el {new Date(record.confirmed_at).toLocaleString("es-GT")}</>}</p>
      <textarea className="input" style={{ width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de confirmación, reapertura o reanálisis" disabled={reanalyzing} />
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => act("confirm")} disabled={reanalyzing}>Confirmar encuesta</button>
        {record.validation_status === "Confirmada" && <button className="btn secondary" onClick={() => act("reopen")} disabled={reanalyzing}>Reabrir y editar</button>}
        <button className="btn secondary" onClick={reanalyze} disabled={reanalyzing}>{reanalyzing ? "Analizando nuevamente…" : "Volver a analizar"}</button>
      </div>
      {reanalyzing && <div style={{ height: 10, background: "#dce9e8", borderRadius: 999, overflow: "hidden", margin: "12px 0" }}><div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#087d70,#0aa18e)", transition: "width .65s ease" }} /></div>}
      {reanalyzing && <p className="muted">El sistema está leyendo nuevamente el documento original. Mantén esta pantalla abierta.</p>}
      {msg && <p>{msg}</p>}
    </div>
  );
}
