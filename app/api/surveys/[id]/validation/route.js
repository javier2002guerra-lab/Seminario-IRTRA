import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit } from "@/lib/db";
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador")) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const { id } = await params, record = await get("SELECT * FROM surveys WHERE id=?", Number(id)), b = await req.json();
  if (!record) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
  if (!["confirm", "reopen"].includes(b.action) || !String(b.reason || "").trim()) return NextResponse.json({ error: "Acción y motivo obligatorios." }, { status: 400 });
  if (b.action === "confirm") {
    await run("UPDATE surveys SET validation_status='Confirmada',needs_review=0,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?", user.id, record.id);
    await audit({ userId: user.id, action: "SURVEY_CONFIRM", entityType: "survey", entityId: record.id, before: { validation_status: record.validation_status }, after: { validation_status: "Confirmada", reason: b.reason } });
  } else {
    await run("UPDATE surveys SET validation_status='En revisión',needs_review=1,confirmed_by=NULL,confirmed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", record.id);
    await audit({ userId: user.id, action: "SURVEY_REOPEN", entityType: "survey", entityId: record.id, before: { validation_status: record.validation_status }, after: { validation_status: "En revisión", reason: b.reason } });
  }
  return NextResponse.json({ ok: true });
}
