import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { get, run, audit } from "@/lib/db";
const states = ["Validado", "Rechazado", "Requiere evidencia"];
export async function PATCH(req, { params }) {
  const user = await currentUser();
  if (user?.role !== "admin")
    return NextResponse.json(
      { error: "Solo el Administrador puede validar el impacto financiero." },
      { status: 403 },
    );
  const { id } = await params,
    plan = await get("SELECT * FROM action_plans WHERE id=?", Number(id)),
    b = await req.json();
  if (!plan)
    return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  if (
    !states.includes(b.financial_status) ||
    String(b.financial_note || "").trim().length < 5
  )
    return NextResponse.json(
      { error: "Selecciona una decisión y documenta la validación." },
      { status: 400 },
    );
  const actual =
    b.financial_status === "Validado"
      ? Number(b.actual_savings || 0)
      : null;
  if (actual !== null && (!Number.isFinite(actual) || actual < 0 || actual > 999999999999.99))
    return NextResponse.json({ error: "El ahorro debe ser un importe válido y no negativo." }, { status: 400 });
  await run(
    "UPDATE action_plans SET actual_savings=?,financial_status=?,financial_note=?,financial_validated_by=?,financial_validated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    actual,
    b.financial_status,
    String(b.financial_note).slice(0, 2000),
    user.id,
    plan.id,
  );
  await audit({
    userId: user.id,
    action: "ACTION_FINANCIAL_VALIDATION",
    entityType: "action_plan",
    entityId: plan.id,
    before: {
      financial_status: plan.financial_status,
      actual_savings: plan.actual_savings,
    },
    after: {
      financial_status: b.financial_status,
      actual_savings: actual,
      note: b.financial_note,
    },
  });
  return NextResponse.json({ ok: true });
}
