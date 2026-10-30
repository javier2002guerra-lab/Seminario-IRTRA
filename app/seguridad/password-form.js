"use client";
import { useState } from "react";

export default function PasswordForm({ mfaEnabled }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    const body = await response.json();
    if (response.ok) location.assign("/login?reason=password-changed");
    else setMessage(body.error || "No fue posible cambiar la contraseña.");
    setBusy(false);
  }
  return (
    <div className="grid two">
      <form className="card" onSubmit={submit}>
        <h3>Cambiar contraseña</h3>
        <label>Contraseña actual</label>
        <input className="input" type="password" name="currentPassword" autoComplete="current-password" required />
        <label>Nueva contraseña</label>
        <input className="input" type="password" name="newPassword" autoComplete="new-password" minLength="14" maxLength="128" required />
        <p className="muted">Usa 14 o más caracteres con mayúscula, minúscula, número y símbolo. Se cerrarán todas las sesiones.</p>
        <button className="btn" disabled={busy}>{busy ? "Actualizando…" : "Cambiar contraseña"}</button>
        {message && <div className="notice">{message}</div>}
      </form>
      <section className="card">
        <h3>Segundo factor</h3>
        <p><span className="badge">{mfaEnabled ? "Activo" : "Pendiente"}</span></p>
        <p className="muted">MFA es obligatorio. Si pierdes el dispositivo y todos los códigos de recuperación, un administrador debe reiniciar tu registro.</p>
      </section>
    </div>
  );
}
