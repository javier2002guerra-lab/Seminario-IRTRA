import { migrate, closeDatabase } from "../lib/db.js";
import { refreshSlaAlerts } from "../lib/sla.js";
try {
  await migrate();
  const result = await refreshSlaAlerts();
  console.log(`SLA verificados: ${result.scanned}; alertas creadas: ${result.created}.`);
} finally { await closeDatabase(); }
