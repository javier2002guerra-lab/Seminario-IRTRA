// Puente entre las escrituras del dominio y los dos aportes:
//   1) invalida la caché del tablero ejecutivo (coherencia inmediata), y
//   2) publica una notificación en tiempo real (SSE) para refrescar las vistas.
// Cualquier endpoint que cambie encuestas, acciones o recuperación debe llamar
// a notifySurveyChange tras confirmar la operación.

import { invalidateExecutive } from "./cache.js";
import { publish } from "./events.js";

export async function notifySurveyChange(type = "survey.updated", payload = {}) {
  await invalidateExecutive();
  return publish(type, payload);
}
