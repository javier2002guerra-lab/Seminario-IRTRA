import { get, query, run, transaction } from "./db.js";
import { executiveData } from "./executive.js";
import { sendEnterpriseNotification } from "./enterprise-notifications.js";
import { refreshSlaAlerts } from "./sla.js";
const zone = "America/Guatemala";
function localParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.weekday,
    ),
  };
}
function due(schedule, now = new Date()) {
  const p = localParts(now),
    last = schedule.last_sent_at
      ? localParts(new Date(schedule.last_sent_at))
      : null;
  if (p.hour < Number(schedule.hour_local)) return false;
  if (schedule.cadence === "Diario")
    return (
      !last ||
      `${last.year}-${last.month}-${last.day}` !==
        `${p.year}-${p.month}-${p.day}`
    );
  if (schedule.cadence === "Semanal")
    return (
      p.weekday === Number(schedule.day_of_week) &&
      (!last || now - new Date(schedule.last_sent_at) > 6 * 86400000)
    );
  return (
    p.day === Number(schedule.day_of_month) &&
    (!last || last.month !== p.month || last.year !== p.year)
  );
}
function range(cadence) {
  const to = new Date(),
    from = new Date(to);
  from.setDate(
    from.getDate() -
      (cadence === "Diario" ? 1 : cadence === "Semanal" ? 7 : 30),
  );
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
function reportHtml(schedule, data) {
  const alerts = data.alerts
    .map(
      (x) => `<li><b>${escapeHtml(x.title)}:</b> ${escapeHtml(x.message)}</li>`,
    )
    .join("");
  const recommendations = data.recommendations
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");
  return `<div style="font-family:Arial;color:#12242d;max-width:760px"><h1 style="color:#087d70">IRTRA ENCUESTAS</h1><h2>${escapeHtml(schedule.name)}</h2><p>Período: ${escapeHtml(data.from)} al ${escapeHtml(data.to)}</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:12px;background:#eef7f5"><b>Encuestas</b><br>${Number(data.kpis.total)}</td><td style="padding:12px;background:#eef7f5"><b>Satisfacción</b><br>${Number(data.kpis.satisfaction) || "—"}/5</td><td style="padding:12px;background:#eef7f5"><b>Quejas</b><br>${Number(data.kpis.complaintRate)}%</td><td style="padding:12px;background:#eef7f5"><b>Resolución</b><br>${Number(data.kpis.resolutionRate)}%</td></tr></table><h3>Alertas</h3>${alerts ? `<ul>${alerts}</ul>` : "<p>Sin alertas relevantes.</p>"}<h3>Acciones recomendadas</h3><ol>${recommendations}</ol><p><a href="${process.env.APP_BASE_URL || "https://irtra-encuestas.onrender.com"}/reportes/ejecutivo?from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}">Abrir informe ejecutivo completo</a></p><small>Mensaje interno automático. No contiene datos personales de huéspedes.</small></div>`;
}
export async function runScheduledReports() {
  return transaction(async () => {
    const lock = await get("SELECT pg_try_advisory_xact_lock(260804) locked");
    if (!lock?.locked) return { skipped: true };
    const schedules = await query(
        "SELECT * FROM report_schedules WHERE active=1 ORDER BY id",
      ),
      results = [];
    for (const schedule of schedules) {
      if (!due(schedule)) continue;
      const period = range(schedule.cadence),
        data = await executiveData(period),
        channels = JSON.parse(schedule.channels_json || '["email"]'),
        recipients = String(schedule.recipients || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        subject = `IRTRA ENCUESTAS · ${schedule.name}`,
        text = `${data.kpis.total} encuestas, satisfacción ${data.kpis.satisfaction || "sin datos"}/5, quejas ${data.kpis.complaintRate}%, resolución ${data.kpis.resolutionRate}%.`;
      const deliveries = await sendEnterpriseNotification({
        kind: "informe_programado",
        subject,
        text,
        html: reportHtml(schedule, data),
        recipients,
        channels,
      });
      await run(
        "UPDATE report_schedules SET last_sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        schedule.id,
      );
      results.push({ id: schedule.id, deliveries });
    }
    return { scanned: schedules.length, sent: results.length, results };
  });
}
async function dispatchOperationalAlerts() {
  const result = await refreshSlaAlerts();
  if (!result.created) return result;
  const channels = String(process.env.INTERNAL_ALERT_CHANNELS || "email")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    recipients = String(process.env.INTERNAL_ALERT_EMAILS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  await sendEnterpriseNotification({
    kind: "alerta_operativa",
    subject: "IRTRA ENCUESTAS · Nuevas alertas operativas",
    text: `Se generaron ${result.created} alertas nuevas al revisar ${result.scanned} casos. Ingresa a Alertas operativas para atenderlas.`,
    html: `<h2>IRTRA ENCUESTAS</h2><p>Se generaron <b>${result.created}</b> alertas nuevas al revisar ${result.scanned} casos.</p><p><a href="${process.env.APP_BASE_URL || "https://irtra-encuestas.onrender.com"}/alertas">Abrir Alertas operativas</a></p>`,
    recipients,
    channels,
  });
  return result;
}
let timer;
export function startReportScheduler() {
  if (timer || process.env.REPORT_SCHEDULER_ENABLED === "false") return;
  const execute = () =>
    Promise.all([runScheduledReports(), dispatchOperationalAlerts()]).catch(
      (error) => console.error("[Informes programados]", error.message),
    );
  setTimeout(execute, 30000);
  timer = setInterval(execute, 60 * 60 * 1000);
  timer.unref?.();
}
