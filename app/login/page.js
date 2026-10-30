"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiJson } from "@/lib/http-client";

export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("password");
  const [enrollment, setEnrollment] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const router = useRouter();

  function finishLogin() {
    router.replace("/");
    router.refresh();
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const endpoint =
        step === "password" ? "/api/auth/login" : "/api/auth/mfa/verify";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await readApiJson(response);
      if (!response.ok) {
        setError(body.error || "No fue posible completar el acceso.");
        return;
      }
      if (step === "password") {
        if (body.enrollmentRequired) {
          const setup = await fetch("/api/auth/mfa/setup", { method: "POST" });
          const setupBody = await readApiJson(setup);
          if (!setup.ok) {
            setError(setupBody.error || "No fue posible configurar MFA.");
            return;
          }
          setEnrollment(setupBody);
          setStep("enroll");
        } else setStep("otp");
        return;
      }
      if (body.recoveryCodes?.length) {
        setRecoveryCodes(body.recoveryCodes);
        setStep("recovery");
        return;
      }
      finishLogin();
    } catch {
      setError(
        "No fue posible conectar con el servicio de autenticación. Verifica que la aplicación y PostgreSQL estén activos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="login-logo">
          <img src="/images/logo-los-hostales.webp" alt="Los Hostales del IRTRA" />
        </div>
        <h1>Decisiones de calidad respaldadas por evidencia.</h1>
        <p>
          Centraliza encuestas, detecta prioridades y convierte la voz del
          visitante en acciones claras, medibles y auditables.
        </p>
      </section>
      <section className="login-panel">
        <form className="login-card" method="post" onSubmit={submit}>
          <div className="eyebrow">Acceso protegido</div>
          <h2>
            {step === "password"
              ? "Bienvenido"
              : step === "enroll"
                ? "Activa el segundo factor"
                : step === "recovery"
                  ? "Guarda tus códigos"
                  : "Verificación en dos pasos"}
          </h2>
          <p className="muted">
            {step === "password"
              ? "Ingresa tus credenciales institucionales."
              : step === "enroll"
                ? "Agrega esta cuenta en Microsoft Authenticator, Google Authenticator u otra aplicación TOTP."
                : step === "recovery"
                  ? "Cada código funciona una sola vez. Guárdalos en un lugar seguro; no volverán a mostrarse."
                  : "Escribe el código de seis dígitos o un código de recuperación."}
          </p>
          {error && <div className="notice">{error}</div>}
          {step === "password" && (
            <>
              <label htmlFor="login-email">Correo electrónico</label>
              <input id="login-email" className="input" type="email" name="email" autoComplete="username" required />
              <label htmlFor="login-password">Contraseña</label>
              <input id="login-password" className="input" type="password" name="password" autoComplete="current-password" required />
            </>
          )}
          {step === "enroll" && enrollment && (
            <div className="notice" style={{ overflowWrap: "anywhere" }}>
              <b>Clave manual:</b><br />
              <code data-testid="mfa-secret">{enrollment.secret}</code>
              <details style={{ marginTop: 10 }}>
                <summary>URI para configuración avanzada</summary>
                <code>{enrollment.uri}</code>
              </details>
            </div>
          )}
          {["otp", "enroll"].includes(step) && (
            <>
              <label htmlFor="login-code">Código MFA</label>
              <input id="login-code" className="input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[A-Za-z0-9 -]{6,20}" maxLength="20" required autoFocus />
            </>
          )}
          {step === "recovery" ? (
            <>
              <ul data-testid="recovery-codes" style={{ columns: 2 }}>
                {recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}
              </ul>
              <button className="btn" type="button" onClick={finishLogin}>Confirmo que los guardé</button>
            </>
          ) : (
            <button className="btn" disabled={loading}>
              {loading ? "Verificando…" : step === "password" ? "Continuar" : "Verificar y entrar"}
            </button>
          )}
          <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            Sesión cifrada · MFA obligatorio · Acceso auditado
          </p>
        </form>
      </section>
    </div>
  );
}
