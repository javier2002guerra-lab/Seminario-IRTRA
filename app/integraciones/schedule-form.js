"use client";
import { useState } from "react";
export default function ScheduleForm({ channels }) {
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      body = Object.fromEntries(fd);
    body.channels = fd.getAll("channels");
    const r = await fetch("/api/admin/report-schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      j = await r.json();
    setMsg(r.ok ? "Programación creada." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  async function run() {
    setBusy(true);
    const r = await fetch("/api/admin/report-schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run-now" }),
      }),
      j = await r.json();
    setMsg(
      r.ok
        ? `Ejecución completada: ${j.result?.sent || 0} informes enviados.`
        : j.error,
    );
    setBusy(false);
  }
  return (
    <div className="grid two">
      <form className="card" onSubmit={save}>
        <h3>Programar informe ejecutivo</h3>
        <label>
          Nombre
          <input
            className="input"
            name="name"
            defaultValue="Informe ejecutivo gerencial"
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Frecuencia
            <select className="input" name="cadence">
              {["Diario", "Semanal", "Mensual"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Hora de Guatemala
            <input
              className="input"
              name="hour_local"
              type="number"
              min="0"
              max="23"
              defaultValue="8"
            />
          </label>
          <label>
            Día de la semana
            <select className="input" name="day_of_week" defaultValue="1">
              {[
                "Domingo",
                "Lunes",
                "Martes",
                "Miércoles",
                "Jueves",
                "Viernes",
                "Sábado",
              ].map((x, i) => (
                <option key={x} value={i}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Día del mes
            <input
              className="input"
              name="day_of_month"
              type="number"
              min="1"
              max="28"
              defaultValue="1"
            />
          </label>
        </div>
        <label>
          Correos corporativos separados por coma
          <input
            className="input"
            name="recipients"
            type="text"
            placeholder="gerencia@empresa.com"
          />
        </label>
        <fieldset>
          <legend>Canales internos</legend>
          <label>
            <input
              type="checkbox"
              name="channels"
              value="email"
              defaultChecked
            />{" "}
            Correo {channels.email ? "✓" : "(requiere SMTP)"}
          </label>
          <label>
            <input type="checkbox" name="channels" value="teams" /> Microsoft
            Teams {channels.teams ? "✓" : "(requiere webhook)"}
          </label>
          <label>
            <input type="checkbox" name="channels" value="whatsapp" /> WhatsApp
            corporativo interno {channels.whatsapp ? "✓" : "(requiere API)"}
          </label>
        </fieldset>
        <button className="btn">Guardar programación</button>
      </form>
      <div className="card">
        <h3>Operación automática</h3>
        <p>
          El servidor revisa las programaciones cada hora usando la zona{" "}
          <b>America/Guatemala</b>. Un bloqueo transaccional evita envíos
          duplicados si existen varias instancias.
        </p>
        <p className="muted">
          Los canales se destinan exclusivamente a responsables internos; este
          módulo no envía mensajes a huéspedes.
        </p>
        <button className="btn secondary" onClick={run} disabled={busy}>
          {busy ? "Ejecutando…" : "Ejecutar programaciones pendientes ahora"}
        </button>
        {msg && <p>{msg}</p>}
      </div>
    </div>
  );
}
export function ScheduleToggle({ schedule }) {
  const [active, setActive] = useState(Boolean(schedule.active));
  async function toggle() {
    const next = !active,
      r = await fetch("/api/admin/report-schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: schedule.id, active: next }),
      });
    if (r.ok) setActive(next);
  }
  return (
    <button className="btn secondary" onClick={toggle}>
      {active ? "Pausar" : "Activar"}
    </button>
  );
}
