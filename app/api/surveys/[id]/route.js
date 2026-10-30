import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit, transaction } from "@/lib/db";
import { assignSla } from "@/lib/sla";
import { areasWithinScope, scopedSurvey } from "@/lib/scope";
import { notifySurveyChange } from "@/lib/live";

export async function PATCH(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador")) return NextResponse.json({ error: "No tiene permiso." }, { status: 403 });
  const { id } = await params;
  const old = await scopedSurvey(user, id);
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  if (!old) return NextResponse.json({ error: "Caso no encontrado." }, { status: 404 });
  if (!body || typeof body.reason !== "string" || body.reason.trim().length < 5) return NextResponse.json({ error: "Indique un motivo válido." }, { status: 400 });
  const allowed = { category: ["Queja", "Sugerencia", "Felicitación", "Mixta", "Sin observaciones"], priority: ["Crítico", "Alto", "Medio", "Bajo", "Informativo"] };
  if (!allowed.category.includes(body.category) || !allowed.priority.includes(body.priority)) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  if (!(await areasWithinScope(user, body.areas)))
    return NextResponse.json({ error: "No puede asignar áreas fuera de su alcance." }, { status: 403 });
  const original = JSON.parse(old.ai_original || "{}");
  await transaction(async () => {
    for (const field of ["category", "priority", "summary", "primary_topic"]) {
      if (String(old[field] || "") !== String(body[field] || "")) await run(
        "INSERT INTO corrections(survey_id,user_id,field,original_value,previous_value,new_value,reason) VALUES(?,?,?,?,?,?,?)",
        old.id, user.id, field, original[field] ?? old[field], old[field], String(body[field] || "").slice(0, 2000), body.reason.slice(0, 500),
      );
    }
    const oldAreas = JSON.stringify(original.areas || []);
    const newAreas = JSON.stringify(body.areas || []);
    if (oldAreas !== newAreas) await run(
      "INSERT INTO corrections(survey_id,user_id,field,original_value,previous_value,new_value,reason) VALUES(?,?,?,?,?,?,?)",
      old.id, user.id, "areas", oldAreas, "", newAreas, body.reason.slice(0, 500),
    );
    await run(
      "UPDATE surveys SET category=?,priority=?,summary=?,primary_topic=?,needs_review=1,validation_status='En revisión',confirmed_by=NULL,confirmed_at=NULL,status='Asignado',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      body.category, body.priority, String(body.summary || "").slice(0, 2000), String(body.primary_topic || "").slice(0, 300), old.id,
    );
    await run("DELETE FROM survey_areas WHERE survey_id=?", old.id);
    for (const area of body.areas || []) await run(
      "INSERT INTO survey_areas(survey_id,area_id) SELECT ?,id FROM areas WHERE id=? AND active=1 ON CONFLICT DO NOTHING",
      old.id, Number(area),
    );
    await audit({ userId: user.id, action: "HUMAN_REVIEW", entityType: "survey", entityId: old.id, before: { category: old.category, priority: old.priority, summary: old.summary, topic: old.primary_topic }, after: { category: body.category, priority: body.priority, summary: body.summary, topic: body.primary_topic, areas: body.areas, reason: body.reason } });
  });
  await assignSla(old.id);
  await notifySurveyChange("survey.updated", { entityId: old.id });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  return NextResponse.json({ error: "Use el proceso de solicitud y aprobación para eliminar encuestas." }, { status: 405 });
}
