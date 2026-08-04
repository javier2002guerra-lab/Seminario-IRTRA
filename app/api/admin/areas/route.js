import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { run, audit } from "@/lib/db";
export async function POST(req) {
  const user = await currentUser();
  if (!can(user, "admin"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const b = await req.json();
  if (!b.name)
    return NextResponse.json({ error: "Nombre obligatorio." }, { status: 400 });
  const sla = {
    Crítico: Number(b.critical || 1),
    Alto: Number(b.high || 4),
    Medio: Number(b.medium || 24),
    Bajo: Number(b.low || 72),
    Informativo: Number(b.info || 120),
  };
  try {
    const x = await run(
      "INSERT INTO areas(name,description,owner,contact,active,sla_json) VALUES(?,?,?,?,?,?) RETURNING id",
      b.name.slice(0, 160),
      String(b.description || "").slice(0, 500),
      String(b.owner || "").slice(0, 120),
      String(b.contact || "").slice(0, 160),
      b.active === false ? 0 : 1,
      JSON.stringify(sla),
    );
    await audit({
      userId: user.id,
      action: "AREA_CREATE",
      entityType: "area",
      entityId: Number(x.lastInsertRowid),
      after: { ...b, sla },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "El área ya existe." }, { status: 409 });
  }
}
export async function PATCH(req) {
  const user = await currentUser();
  if (!can(user, "admin"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  const b = await req.json();
  await run(
    "UPDATE areas SET description=?,owner=?,contact=?,active=?,sla_json=? WHERE id=?",
    String(b.description || "").slice(0, 500),
    String(b.owner || "").slice(0, 120),
    String(b.contact || "").slice(0, 160),
    b.active ? 1 : 0,
    JSON.stringify(b.sla || {}),
    Number(b.id),
  );
  await audit({
    userId: user.id,
    action: "AREA_UPDATE",
    entityType: "area",
    entityId: b.id,
    after: b,
  });
  return NextResponse.json({ ok: true });
}
