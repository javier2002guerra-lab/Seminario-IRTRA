import { get, query, run, transaction, audit } from "./db.js";

const closed = ["Resuelto", "Cerrado", "Error"];

export async function assignSla(surveyId) {
  const record = await get("SELECT id,priority,created_at FROM surveys WHERE id=?", surveyId);
  if (!record) return null;
  const areas = await query("SELECT a.sla_json FROM areas a JOIN survey_areas sa ON sa.area_id=a.id WHERE sa.survey_id=? AND a.active=1", surveyId);
  const candidates = areas.map(({ sla_json }) => {
    try { return Number(JSON.parse(sla_json || "{}")[record.priority]) || 120; } catch { return 120; }
  });
  const hours = Math.max(1, Math.min(...candidates, 120));
  const due = new Date(new Date(record.created_at).getTime() + hours * 3600000);
  await run("UPDATE surveys SET sla_hours=?,due_at=? WHERE id=?", hours, due, surveyId);
  return { hours, due };
}

export function slaState(record, now = new Date()) {
  if (!record?.due_at || closed.includes(record.status)) return "none";
  const remaining = new Date(record.due_at).getTime() - now.getTime();
  if (remaining <= 0) return "overdue";
  if (remaining <= Math.max(3600000, Number(record.sla_hours || 1) * 360000)) return "risk";
  return "on_track";
}

export async function refreshSlaAlerts() {
  const cases = await query("SELECT * FROM surveys WHERE due_at IS NOT NULL AND status NOT IN ('Resuelto','Cerrado','Error') AND due_at<=CURRENT_TIMESTAMP + INTERVAL '4 hours'");
  let created = 0;
  for (const record of cases) {
    const type = new Date(record.due_at) <= new Date() ? "SLA_OVERDUE" : "SLA_RISK";
    const recipients = await query(
      "SELECT DISTINCT u.id FROM users u WHERE u.active=1 AND (u.role='admin' OR (u.role='verificador' AND EXISTS (SELECT 1 FROM user_areas ua JOIN survey_areas sa ON sa.area_id=ua.area_id WHERE ua.user_id=u.id AND sa.survey_id=?)))",
      record.id,
    );
    await transaction(async () => {
      for (const user of recipients) {
        const result = await run("INSERT INTO notifications(user_id,survey_id,type,title,message) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING", user.id, record.id, type, type === "SLA_OVERDUE" ? "SLA vencido" : "SLA próximo a vencer", `El caso #${record.id} requiere atención antes de ${new Date(record.due_at).toLocaleString("es-GT")}.`);
        created += result.rowCount;
      }
      if (type === "SLA_OVERDUE" && !record.escalated_at) {
        await run("UPDATE surveys SET escalated_at=CURRENT_TIMESTAMP WHERE id=?", record.id);
        await audit({ action: "SLA_ESCALATED", entityType: "survey", entityId: record.id, after: { due_at: record.due_at } });
      }
    });
  }
  return { scanned: cases.length, created };
}
