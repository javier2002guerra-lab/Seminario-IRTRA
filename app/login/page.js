"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }
  return (
    <div className="login">
      <section className="login-art">
        <div className="login-logo">
          <img
            src="/images/logo-los-hostales.webp"
            alt="Los Hostales del IRTRA"
          />
        </div>
        <h1>Decisiones de calidad respaldadas por evidencia.</h1>
        <p>
          Centraliza encuestas, detecta prioridades y convierte la voz del
          visitante en acciones claras, medibles y auditables.
        </p>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="eyebrow">Acceso protegido</div>
          <h2>Bienvenido</h2>
          <p className="muted">Ingresa tus credenciales institucionales.</p>
          {error && <div className="notice">{error}</div>}
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            id="login-email"
            className="input"
            type="email"
            name="email"
            defaultValue="admin@irtra.local"
            required
          />
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            className="input"
            type="password"
            name="password"
            required
          />
          <button className="btn" disabled={loading}>
            {loading ? "Verificando…" : "Ingresar al sistema"}
          </button>
          <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            Sesión cifrada · Acceso auditado
          </p>
        </form>
      </section>
    </div>
  );
}
