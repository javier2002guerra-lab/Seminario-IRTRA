"use client";
import { useState } from "react";
export default function UserForm({ areas }) {
  const [msg, setMsg] = useState("");
  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd);
    body.areas = fd.getAll("areas");
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    setMsg(r.ok ? "Usuario creado." : j.error);
    if (r.ok) setTimeout(() => location.reload(), 500);
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>Crear usuario</h3>
      <input
        className="input"
        style={{ width: "100%", marginBottom: 10 }}
        name="name"
        placeholder="Nombre completo"
        required
      />
      <input
        className="input"
        style={{ width: "100%", marginBottom: 10 }}
        type="email"
        name="email"
        placeholder="Correo"
        required
      />
      <input
        className="input"
        style={{ width: "100%", marginBottom: 10 }}
        type="password"
        name="password"
        placeholder="Contraseña inicial (14+ caracteres)"
        minLength="14"
        required
      />
      <select
        className="input"
        style={{ width: "100%", marginBottom: 10 }}
        name="role"
      >
        <option value="verificador">Verificador</option>
        <option value="admin">Administrador</option>
      </select>
      <p>
        <b>Áreas autorizadas</b>
      </p>
      {areas.map((a) => (
        <label key={a.id} style={{ display: "block", margin: 6 }}>
          <input type="checkbox" name="areas" value={a.id} /> {a.name}
        </label>
      ))}
      <button className="btn" style={{ marginTop: 12 }}>
        Crear usuario
      </button>
      {msg && <p>{msg}</p>}
    </form>
  );
}
