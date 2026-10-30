import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit, transaction } from "@/lib/db";
import { uploadDirectory } from "@/lib/files";
import { scopedSurvey } from "@/lib/scope";

export async function POST(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await params;
  const survey = await scopedSurvey(user, id);
  if (!survey) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
  const body = await req.json();
  const action = String(body.action || "");
  const reason = String(body.reason || "").trim();
  if (reason.length < 5) return NextResponse.json({ error: "Indique un motivo de al menos 5 caracteres." }, { status: 400 });

  if (action === "request") {
    const pending = await get("SELECT id FROM deletion_requests WHERE survey_id=? AND status='Pendiente'", survey.id);
    if (pending) return NextResponse.json({ error: "Ya existe una solicitud pendiente." }, { status: 409 });
    const inserted = await run("INSERT INTO deletion_requests(survey_id,requested_by,reason) VALUES(?,?,?) RETURNING id", survey.id, user.id, reason.slice(0, 500));
    await audit({ userId: user.id, action: "DELETION_REQUEST", entityType: "survey", entityId: survey.id, after: { request_id: inserted.lastInsertRowid, reason } });
    return NextResponse.json({ ok: true });
  }

  if (user.role !== "admin") return NextResponse.json({ error: "Solo el Administrador puede decidir esta solicitud." }, { status: 403 });
  const request = await get("SELECT * FROM deletion_requests WHERE survey_id=? AND status='Pendiente' ORDER BY id DESC LIMIT 1", survey.id);
  if (!request) return NextResponse.json({ error: "No hay una solicitud pendiente." }, { status: 409 });

  if (action === "reject") {
    await run("UPDATE deletion_requests SET status='Rechazada',decided_by=?,decision_reason=?,decided_at=CURRENT_TIMESTAMP WHERE id=?", user.id, reason.slice(0, 500), request.id);
    await audit({ userId: user.id, action: "DELETION_REJECT", entityType: "survey", entityId: survey.id, after: { request_id: request.id, reason } });
    return NextResponse.json({ ok: true });
  }
  if (action !== "approve") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });

  await transaction(async () => {
    await run("UPDATE deletion_requests SET status='Aprobada',decided_by=?,decision_reason=?,decided_at=CURRENT_TIMESTAMP WHERE id=?", user.id, reason.slice(0, 500), request.id);
    await audit({ userId: user.id, action: "DELETION_APPROVE", entityType: "survey", entityId: survey.id, before: { original_name: survey.original_name, sha256: survey.sha256, category: survey.category, priority: survey.priority }, after: { request_id: request.id, requested_by: request.requested_by, request_reason: request.reason, decision_reason: reason } });
    await run("DELETE FROM service_ratings WHERE survey_id=?", survey.id);
    await run("DELETE FROM survey_areas WHERE survey_id=?", survey.id);
    await run("DELETE FROM corrections WHERE survey_id=?", survey.id);
    await run("DELETE FROM followups WHERE survey_id=?", survey.id);
    await run("DELETE FROM notifications WHERE survey_id=?", survey.id);
    await run("DELETE FROM survey_files WHERE survey_id=?", survey.id);
    await run("DELETE FROM deletion_requests WHERE survey_id=?", survey.id);
    await run("DELETE FROM surveys WHERE id=?", survey.id);
  });
  const safe = path.basename(survey.stored_name);
  const file = path.join(uploadDirectory(), safe);
  if (!survey.stored_name.startsWith("PURGED-") && fs.existsSync(file)) fs.unlinkSync(file);
  return NextResponse.json({ ok: true, deleted: true });
}
