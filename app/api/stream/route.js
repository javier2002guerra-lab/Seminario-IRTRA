// Aporte 2 — Endpoint SSE (Server-Sent Events).
//
// Mantiene una conexión HTTP persistente (text/event-stream) por pestaña y
// reenvía las notificaciones del bus (lib/events.js) al navegador. Envía un
// "ping" periódico para conservar la conexión viva a través de proxies y limpia
// la suscripción cuando el cliente se desconecta (condición límite). Un tope de
// conexiones concurrentes protege el proceso (responde 503 al superarlo).

import { currentUser } from "@/lib/auth";
import {
  subscribe,
  acquireClient,
  releaseClient,
  formatSse,
} from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const user = await currentUser();
  if (!user)
    return new Response("No autenticado.", { status: 401 });
  if (!acquireClient())
    return new Response("Demasiadas conexiones en tiempo real.", {
      status: 503,
    });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (text) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        releaseClient();
        try {
          controller.close();
        } catch {}
      };

      // El cliente reintenta a los 5s si se cae la conexión.
      send("retry: 5000\n\n");
      send(
        formatSse({
          id: 0,
          type: "ready",
          at: new Date().toISOString(),
          user: user.id,
        }),
      );

      // Reenvía cada notificación del dominio al navegador.
      unsubscribe = subscribe((event) => send(formatSse(event)));
      // Comentario SSE cada 15s: mantiene viva la conexión sin ensuciar datos.
      heartbeat = setInterval(() => send(": ping\n\n"), 15000);

      req.signal.addEventListener("abort", close);
    },
    cancel() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      releaseClient();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
