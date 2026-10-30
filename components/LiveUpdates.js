"use client";
// Aporte 2 — Cliente de tiempo real.
//
// Abre una conexión SSE a /api/stream y, ante cada notificación, muestra un
// aviso breve y refresca la vista (router.refresh). Como las páginas son
// dinámicas y server-side, el refresco vuelve a consultar respetando el alcance
// del usuario y aprovecha la caché ya invalidada por la escritura: así el
// usuario ve la información correcta y actualizada sin recargar la página.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LABELS = {
  "survey.ingested": "Nueva encuesta recibida",
  "survey.confirmed": "Encuesta confirmada",
  "survey.reopened": "Encuesta reabierta",
  "survey.reanalyzed": "Encuesta reanalizada",
  "survey.recovered": "Recuperación registrada",
  "survey.updated": "Encuesta actualizada",
  "action.created": "Nuevo plan de acción",
  "action.updated": "Plan de acción actualizado",
};

export default function LiveUpdates() {
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [toast, setToast] = useState(null);
  const refreshTimer = useRef(null);

  useEffect(() => {
    let source;
    try {
      source = new EventSource("/api/stream");
    } catch {
      return; // Navegador sin EventSource: la app sigue funcionando normal.
    }
    source.onopen = () => setOnline(true);
    // Ante un corte, EventSource reintenta automáticamente (retry: 5000).
    source.onerror = () => setOnline(false);

    const onEvent = (type) => () => {
      setToast({ text: LABELS[type] || "Actualización", at: Date.now() });
      // Debounce: agrupa ráfagas de eventos en un solo refresco.
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 600);
    };
    const handlers = Object.keys(LABELS).map((type) => {
      const handler = onEvent(type);
      source.addEventListener(type, handler);
      return [type, handler];
    });

    return () => {
      clearTimeout(refreshTimer.current);
      for (const [type, handler] of handlers)
        source.removeEventListener(type, handler);
      source.close();
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="live-wrap">
      <span
        className={`live-dot ${online ? "on" : "off"}`}
        title={online ? "Tiempo real conectado" : "Reconectando…"}
        aria-label={online ? "Tiempo real conectado" : "Reconectando"}
      />
      <div className="live-toasts" aria-live="polite">
        {toast && (
          <div className="live-toast" role="status" key={toast.at}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
