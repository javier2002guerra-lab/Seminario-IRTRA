"use client";
import { useState } from "react";
export default function ActionManager({ areas, users, surveys }) {
  const [msg, setMsg] = useState("");
  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget,
      r = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      }),
      j = await r.json();
    setMsg(r.ok ? "Plan de acción creado." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  return (
    <form className="card action-form" onSubmit={create}>
      <h3>Nuevo plan de acción</h3>
      <div className="form-grid">
        <label>
          Título
          <input className="input" name="title" required />
        </label>
        <label>
          Prioridad
          <select className="input" name="priority" defaultValue="Medio">
            {["Crítico", "Alto", "Medio", "Bajo", "Informativo"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Área responsable
          <select className="input" name="area_id">
            <option value="">Sin asignar</option>
            {areas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsable
          <select className="input" name="owner_id">
            <option value="">Sin asignar</option>
            {users.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha límite
          <input className="input" type="datetime-local" name="due_at" />
        </label>
        <label>
          Encuesta relacionada
          <select className="input" name="survey_id">
            <option value="">Acción general</option>
            {surveys.map((x) => (
              <option key={x.id} value={x.id}>
                #{x.id} · {x.original_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Descripción
        <textarea className="input" name="description" rows="3" />
      </label>
      <div className="form-grid">
        <label>
          Impacto esperado
          <input className="input" name="expected_impact" />
        </label>
        <label>
          Ahorro estimado (Q)
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            name="estimated_savings"
            defaultValue="0"
          />
        </label>
      </div>
      <button className="btn">Crear plan de acción</button>
      {msg && <p>{msg}</p>}
    </form>
  );
}
export function ActionUpdate({ plan, isAdmin = false }) {
  const [status, setStatus] = useState(plan.status),
    [evidence, setEvidence] = useState(plan.evidence || ""),
    [result, setResult] = useState(plan.result || ""),
    [msg, setMsg] = useState("");
  async function save() {
    const r = await fetch(`/api/actions/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, evidence, result }),
      }),
      j = await r.json();
    setMsg(r.ok ? "Plan actualizado." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  return (
    <details>
      <summary>Actualizar</summary>
      <div className="action-update">
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["Pendiente", "En ejecución", "Verificada", "Cerrada"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <textarea
          className="input"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Evidencia de cumplimiento"
        />
        <textarea
          className="input"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder="Resultado conseguido"
        />
        <button className="btn" type="button" onClick={save}>
          Guardar avance
        </button>
        {msg && <small>{msg}</small>}
      </div>
      {isAdmin && <FinancialValidation plan={plan} />}
    </details>
  );
}
function FinancialValidation({ plan }) {
  const [status, setStatus] = useState(plan.financial_status || "Sin validar"),
    [actual, setActual] = useState(
      plan.actual_savings ?? plan.estimated_savings ?? 0,
    ),
    [note, setNote] = useState(plan.financial_note || ""),
    [msg, setMsg] = useState("");
  async function validate() {
    const r = await fetch(`/api/actions/${plan.id}/finance`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          financial_status: status,
          actual_savings: actual,
          financial_note: note,
        }),
      }),
      j = await r.json();
    setMsg(r.ok ? "Impacto financiero validado." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  return (
    <div className="financial-validation">
      <b>Validación financiera</b>
      <select
        className="input"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {["Sin validar", "Validado", "Rechazado", "Requiere evidencia"].map(
          (x) => (
            <option key={x}>{x}</option>
          ),
        )}
      </select>
      <input
        className="input"
        type="number"
        min="0"
        step="0.01"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        placeholder="Ahorro real validado"
      />
      <textarea
        className="input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Fuente contable, cálculo o evidencia de validación"
      />
      <button className="btn secondary" type="button" onClick={validate}>
        Validar impacto financiero
      </button>
      {msg && <small>{msg}</small>}
    </div>
  );
}
