import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { run, audit } from "@/lib/db";
import { scopedActionPlan } from "@/lib/scope";
import { notifySurveyChange } from "@/lib/live";

const states = ["Pendiente", "En ejecución", "Verificada", "Cerrada"];

export async function PATCH(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const { id } = await params;
  const previous = await scopedActionPlan(user, id);
  if (!previous)
    return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!states.includes(body.status))
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  if (
    body.status === "Verificada" &&
    String(body.evidence || "").trim().length < 5
  )
    return NextResponse.json(
      { error: "Agrega evidencia antes de verificar." },
      { status: 400 },
    );
  await run(
    "UPDATE action_plans SET status=?,evidence=?,result=?,verified_by=CASE WHEN ?='Verificada' THEN ? ELSE verified_by END,verified_at=CASE WHEN ?='Verificada' THEN CURRENT_TIMESTAMP ELSE verified_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    body.status,
    String(body.evidence || previous.evidence || "").slice(0, 3000),
    String(body.result || previous.result || "").slice(0, 3000),
    body.status,
    user.id,
    body.status,
    previous.id,
  );
  await audit({
    userId: user.id,
    action: "ACTION_PLAN_UPDATED",
    entityType: "action_plan",
    entityId: previous.id,
    before: { status: previous.status },
    after: { status: body.status },
  });
  await notifySurveyChange("action.updated", { entityId: previous.id });
  return NextResponse.json({ ok: true });
}
