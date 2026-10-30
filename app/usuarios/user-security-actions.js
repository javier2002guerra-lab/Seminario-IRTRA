"use client";
import { useState } from "react";

export default function UserSecurityActions({ user }) {
  const [busy, setBusy] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  async function action(name) {
    const warning =
      name === "reset_mfa"
        ? "Se cerrarán sus sesiones y deberá registrar MFA nuevamente."
        : name === "reset_password"
          ? "Se generará una contraseña temporal y se cerrarán sus sesiones."
        : name === "deactivate"
          ? "Se cerrarán sus sesiones y no podrá ingresar."
          : "La cuenta podrá iniciar sesión nuevamente.";
    if (!confirm(warning)) return;
    setBusy(true);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: user.id, action: name }),
    });
    const body = await response.json();
    if (!response.ok) alert(body.error || "No fue posible actualizar la cuenta.");
    else if (body.temporaryPassword) {
      setTemporaryPassword(body.temporaryPassword);
      setBusy(false);
      return;
    } else location.reload();
    setBusy(false);
  }
  return (
    <div className="toolbar">
      <button className="btn secondary" type="button" disabled={busy} onClick={() => action("reset_mfa")}>Reiniciar MFA</button>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => action("reset_password")}>Restablecer clave</button>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => action(user.active ? "deactivate" : "activate")}>
        {user.active ? "Desactivar" : "Activar"}
      </button>
      {temporaryPassword && (
        <div className="notice" style={{ overflowWrap: "anywhere" }}>
          <b>Contraseña temporal (se muestra una sola vez en esta pantalla):</b><br />
          <code>{temporaryPassword}</code>
        </div>
      )}
    </div>
  );
}
