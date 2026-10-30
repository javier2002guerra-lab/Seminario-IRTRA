import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit } from "@/lib/db";
import { areasWithinScope, scopedSurvey } from "@/lib/scope";
import { notifySurveyChange } from "@/lib/live";

const priorities = ["Crítico", "Alto", "Medio", "Bajo", "Informativo"];

export async function POST(req) {
  const user = await currentUser();
  if (!can(user, "verificador"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const title = String(body.title || "").trim();
  const areaId = body.area_id ? Number(body.area_id) : null;
  const surveyId = body.survey_id ? Number(body.survey_id) : null;
  const ownerId = body.owner_id ? Number(body.owner_id) : null;
  const savings = Number(body.estimated_savings || 0);
  const dueAt = body.due_at ? new Date(body.due_at) : null;
  if (
    !title ||
    title.length > 180 ||
    !priorities.includes(body.priority) ||
    (areaId !== null && !Number.isSafeInteger(areaId)) ||
    (surveyId !== null && !Number.isSafeInteger(surveyId)) ||
    (ownerId !== null && !Number.isSafeInteger(ownerId)) ||
    !Number.isFinite(savings) ||
    savings < 0 ||
    (dueAt && Number.isNaN(dueAt.getTime()))
  )
    return NextResponse.json(
      { error: "Datos del plan inválidos." },
      { status: 400 },
    );
  if (!areaId || !(await areasWithinScope(user, [areaId])))
    return NextResponse.json({ error: "Área fuera de su alcance." }, { status: 403 });
  if (surveyId && !(await scopedSurvey(user, surveyId)))
    return NextResponse.json({ error: "Encuesta fuera de su alcance." }, { status: 403 });
  if (ownerId) {
    const allowedOwner = await get(
      "SELECT 1 ok FROM users u JOIN user_areas ua ON ua.user_id=u.id WHERE u.id=? AND u.active=1 AND ua.area_id=?",
      ownerId,
      areaId,
    );
    if (!allowedOwner)
      return NextResponse.json(
        { error: "Responsable fuera del área seleccionada." },
        { status: 403 },
      );
  }
  const result = await run(
    "INSERT INTO action_plans(survey_id,title,description,area_id,owner_id,priority,status,due_at,expected_impact,estimated_savings,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    surveyId,
    title,
    String(body.description || "").trim().slice(0, 3000),
    areaId,
    ownerId,
    body.priority,
    "Pendiente",
    dueAt?.toISOString() || null,
    String(body.expected_impact || "").slice(0, 1000),
    savings,
    user.id,
  );
  await audit({
    userId: user.id,
    action: "ACTION_PLAN_CREATED",
    entityType: "action_plan",
    entityId: result.lastInsertRowid,
    after: { surveyId, areaId, ownerId, priority: body.priority },
  });
  await notifySurveyChange("action.created", { entityId: result.lastInsertRowid });
  return NextResponse.json({ ok: true, id: result.lastInsertRowid }, { status: 201 });
}
