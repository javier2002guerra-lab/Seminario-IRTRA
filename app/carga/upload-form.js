"use client";
import { useEffect, useRef, useState } from "react";

export default function UploadForm() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  async function upload(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setResult(null);
    setProgress(8);
    setStage("Validando documentos");
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        if (current >= 25) setStage("El sistema está leyendo y analizando la encuesta");
        else if (current >= 14) setStage("Enviando documentos de forma segura");
        const step = current < 25 ? 3 : current < 70 ? 1.4 : 0.5;
        return Math.min(92, current + step);
      });
    }, 700);

    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        body: new FormData(form),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : { error: "El servidor no devolvió una respuesta válida." };
      setResult(data);
      setProgress(100);
      setStage(response.ok ? "Procesamiento completado" : "No se pudo completar");
      if (response.ok) form.reset();
    } catch {
      setResult({ error: "Se perdió la conexión durante el procesamiento." });
      setStage("Procesamiento interrumpido");
    } finally {
      clearInterval(timer.current);
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={upload}>
      <div className="drop">
        <div style={{ fontSize: 34 }}>⇧</div>
        <h3>Selecciona tus documentos</h3>
        <p className="muted">PDF, JPG, JPEG o PNG · máximo 50 MB por archivo</p>
        <input name="files" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple required />
      </div>
      <div className="toolbar" style={{ marginTop: 18 }}>
        <button className="btn" disabled={busy}>{busy ? "Validando y procesando…" : "Procesar encuestas"}</button>
        <span className="muted">Se valida firma real, MIME, tamaño y duplicados.</span>
      </div>
      {(busy || progress > 0) && (
        <div className="processing-progress" aria-live="polite">
          <div className="progress-header"><strong>{stage}</strong><span>{Math.round(progress)}%</span></div>
          <div className="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          {busy && <p className="muted">Mantén esta pantalla abierta. El avance puede variar según la legibilidad y la cantidad de documentos.</p>}
        </div>
      )}
      {result && <div className={result.error ? "notice" : "badge"}>{result.error || `${result.created} documento(s) recibido(s). ${result.errors?.join(" ") || ""}`}</div>}
      <style jsx>{`
        .processing-progress { margin: 18px 0; padding: 16px; border: 1px solid #cce1df; border-radius: 12px; background: #f5fbfa; }
        .progress-header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 10px; color: #155b55; }
        .progress-track { height: 12px; overflow: hidden; border-radius: 999px; background: #dce9e8; }
        .progress-bar { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #087d70, #0aa18e); transition: width .65s ease; }
        .processing-progress p { font-size: 13px; margin: 10px 0 0; }
      `}</style>
    </form>
  );
}
