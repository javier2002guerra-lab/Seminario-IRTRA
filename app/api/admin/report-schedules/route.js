import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { runScheduledReports } from "@/lib/report-scheduler";
const cadences = ["Diario", "Semanal", "Mensual"],
  allowedChannels = ["email", "teams", "whatsapp"];
export async function POST(req) {
  const user = await currentUser();
  if (user?.role !== "admin")
    return NextResponse.json(
      { error: "Solo el Administrador puede configurar informes." },
      { status: 403 },
    );
  const b = await req.json();
  if (b.action === "run-now") {
    const result = await runScheduledReports();
    return NextResponse.json({ ok: true, result });
  }
  const channels = Array.isArray(b.channels)
    ? b.channels.filter((x) => allowedChannels.includes(x))
    : [];
  if (
    !String(b.name || "").trim() ||
    !cadences.includes(b.cadence) ||
    !channels.length
  )
    return NextResponse.json(
      { error: "Completa nombre, frecuencia y al menos un canal." },
      { status: 400 },
    );
  if (channels.includes("email") && !String(b.recipients || "").includes("@"))
    return NextResponse.json(
      { error: "Agrega al menos un correo corporativo válido." },
      { status: 400 },
    );
  const result = await run(
    "INSERT INTO report_schedules(name,cadence,day_of_week,day_of_month,hour_local,recipients,channels_json,active,created_by) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id",
    String(b.name).trim().slice(0, 160),
    b.cadence,
    Math.min(6, Math.max(0, Number(b.day_of_week || 1))),
    Math.min(28, Math.max(1, Number(b.day_of_month || 1))),
    Math.min(23, Math.max(0, Number(b.hour_local || 8))),
    String(b.recipients || "")
      .trim()
      .slice(0, 1000),
    JSON.stringify(channels),
    b.active === false ? 0 : 1,
    user.id,
  );
  return NextResponse.json(
    { ok: true, id: result.lastInsertRowid },
    { status: 201 },
  );
}
export async function PATCH(req) {
  const user = await currentUser();
  if (user?.role !== "admin")
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const b = await req.json();
  await run(
    "UPDATE report_schedules SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    b.active ? 1 : 0,
    Number(b.id),
  );
  return NextResponse.json({ ok: true });
}
