import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit, transaction } from "@/lib/db";
const states = ["Recibido", "En procesamiento", "Procesado", "Pendiente de revisión", "Asignado", "En atención", "Resuelto", "Cerrado", "Error"];
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador")) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const { id } = await params, survey = await get("SELECT * FROM surveys WHERE id=?", Number(id));
  if (!survey) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  const b = await req.json();
  if (!states.includes(b.status) || !String(b.comment || "").trim()) return NextResponse.json({ error: "Estado o comentario inválido." }, { status: 400 });
  if (b.status === "Cerrado" && (survey.priority === "Crítico" || survey.needs_review)) return NextResponse.json({ error: "Un caso crítico o pendiente de revisión no puede cerrarse." }, { status: 409 });
  await transaction(async () => {
    await run("INSERT INTO followups(survey_id,user_id,comment,status) VALUES(?,?,?,?)", survey.id, user.id, String(b.comment).slice(0, 2000), b.status);
    await run("UPDATE surveys SET status=?,assignee_id=COALESCE(?,assignee_id),resolution_at=CASE WHEN ? IN ('Resuelto','Cerrado') THEN CURRENT_TIMESTAMP ELSE resolution_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?", b.status, b.assignee ? Number(b.assignee) : null, b.status, survey.id);
    await audit({ userId: user.id, action: "CASE_FOLLOWUP", entityType: "survey", entityId: survey.id, before: { status: survey.status, assignee_id: survey.assignee_id }, after: { status: b.status, assignee: b.assignee, comment: b.comment } });
  });
  return NextResponse.json({ ok: true });
}
