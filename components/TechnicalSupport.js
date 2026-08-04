"use client";
import { useEffect, useRef, useState } from "react";
const welcome = {
  role: "assistant",
  content:
    "¡Hola! Soy ATLAS, el asistente de soporte técnico de IRTRA ENCUESTAS. Estoy aquí para ayudarte a resolver dudas o problemas relacionados con el sistema. ¿En qué puedo ayudarte?",
};
export default function TechnicalSupport({ user }) {
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState([welcome]),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false);
  const endRef = useRef(null);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages, sending]);
  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function submit(event) {
    event.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setText("");
    setSending(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo consultar al soporte.");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          actionPlan: data.actionPlan,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `No pude responder en este momento. ${error.message} Intenta nuevamente.`,
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <button
        className="support-trigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Abrir soporte técnico ATLAS"
      >
        <span aria-hidden="true">A</span>
        <em>Soporte ATLAS</em>
      </button>
      {open && (
        <div
          className="support-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="support-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="support-header">
              <div className="support-avatar" aria-hidden="true">
                A
              </div>
              <div>
                <b id="support-title">ATLAS</b>
                <small>
                  Soporte técnico de IRTRA ENCUESTAS · Disponible ahora
                </small>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar soporte"
              >
                ×
              </button>
            </header>
            <div className="support-messages" aria-live="polite">
              {messages.map((message, index) => (
                <div className="support-message-wrap" key={index}>
                  <div
                    className={`support-message ${message.role} ${message.error ? "error" : ""}`}
                  >
                    {message.content}
                  </div>
                  {message.actionPlan && (
                    <AtlasAction
                      plan={message.actionPlan}
                      onCreated={(id) =>
                        setMessages((current) => [
                          ...current,
                          {
                            role: "assistant",
                            content: `Plan de acción #${id} creado correctamente. Puedes administrarlo en “Planes de acción”.`,
                          },
                        ])
                      }
                    />
                  )}
                </div>
              ))}
              {sending && (
                <div className="support-message assistant support-typing">
                  ATLAS está analizando tu consulta…
                </div>
              )}
              <div ref={endRef} />
            </div>
            <form className="support-form" onSubmit={submit}>
              <label className="sr-only" htmlFor="support-question">
                Describe tu duda o inconveniente
              </label>
              <textarea
                id="support-question"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={4000}
                rows={2}
                placeholder={`¿En qué puedo ayudarte, ${user?.name?.split(" ")[0] || "usuario"}?`}
                disabled={sending}
                autoFocus
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                aria-label="Enviar consulta"
              >
                ➤
              </button>
            </form>
            <p className="support-note">
              No compartas contraseñas, claves ni datos sensibles. La IA puede
              cometer errores.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
function AtlasAction({ plan, onCreated }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    const due = new Date(
      Date.now() + Number(plan.due_days || 30) * 86400000,
    ).toISOString();
    const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...plan, due_at: due }),
      }),
      data = await response.json();
    if (response.ok) onCreated(data.id);
    else setError(data.error || "No se pudo crear el plan.");
    setBusy(false);
  }
  return (
    <div className="atlas-action">
      <b>Propuesta de plan</b>
      <span>{plan.title}</span>
      <small>
        {plan.priority} · {plan.due_days} días
      </small>
      <button className="btn" onClick={create} disabled={busy}>
        {busy ? "Creando…" : "Confirmar y crear plan"}
      </button>
      {error && <small className="error">{error}</small>}
    </div>
  );
}
