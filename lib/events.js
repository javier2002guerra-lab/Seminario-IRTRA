// Aporte 2 — Tiempo real (Server-Sent Events).
//
// Bus de eventos en proceso que desacopla a los productores (ingesta de
// encuestas, confirmación, planes de acción) de los consumidores (el endpoint
// SSE en app/api/stream/route.js). Cada evento recibe un id monótono para que
// el cliente pueda reanudar con Last-Event-ID tras una reconexión.
//
// Los eventos son notificaciones livianas y SIN datos sensibles: solo informan
// "algo cambió". El navegador reacciona refrescando la vista, que vuelve a
// consultar respetando el alcance (scope) y los permisos del usuario. Así el
// tiempo real no puede filtrar información fuera del alcance de quien observa.

import { EventEmitter } from "node:events";

const CHANNEL = "event";

// Tope de conexiones concurrentes para proteger el proceso (condición límite).
export const MAX_CLIENTS = Number(process.env.SSE_MAX_CLIENTS) || 200;

// Estado compartido vía globalThis: en producción Next empaqueta las rutas por
// separado, así que el bus debe ser único para todo el proceso. De lo contrario
// las publicaciones (desde ingesta o rutas de escritura) y las suscripciones
// (endpoint SSE) vivirían en buses distintos y no se comunicarían.
const state = (globalThis.__irtraEvents ??= (() => {
  const bus = new EventEmitter();
  // Muchos suscriptores: una conexión SSE por pestaña abierta.
  bus.setMaxListeners(0);
  return { bus, sequence: 0, clients: 0 };
})());

// Publica una notificación. Devuelve el evento con su id para pruebas/registro.
export function publish(type, payload = {}) {
  state.sequence += 1;
  const event = {
    id: state.sequence,
    type: String(type),
    at: new Date().toISOString(),
    ...payload,
  };
  state.bus.emit(CHANNEL, event);
  return event;
}

// Suscribe un oyente; devuelve una función para cancelar la suscripción.
export function subscribe(listener) {
  state.bus.on(CHANNEL, listener);
  return () => state.bus.off(CHANNEL, listener);
}

// Control de cupo de clientes SSE. Devuelve false si se alcanzó el máximo.
export function acquireClient() {
  if (state.clients >= MAX_CLIENTS) return false;
  state.clients += 1;
  return true;
}

export function releaseClient() {
  state.clients = Math.max(0, state.clients - 1);
}

export function liveStats() {
  return {
    clients: state.clients,
    lastEventId: state.sequence,
    maxClients: MAX_CLIENTS,
  };
}

// Serializa un evento al formato del protocolo SSE.
export function formatSse(event) {
  return (
    `id: ${event.id}\n` +
    `event: ${event.type}\n` +
    `data: ${JSON.stringify(event)}\n\n`
  );
}

// Solo para pruebas: reinicia el contador de secuencia y clientes.
export function resetEventsForTests() {
  state.sequence = 0;
  state.clients = 0;
  state.bus.removeAllListeners(CHANNEL);
}
