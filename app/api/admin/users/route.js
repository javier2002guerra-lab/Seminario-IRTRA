import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { get, run, audit, transaction } from "@/lib/db";
const roles = ["admin", "verificador"];
export async function POST(req) {
  const user = await currentUser();
  if (!can(user, "admin"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  let b;
  try {
    b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const selectedAreas = [
    ...new Set((Array.isArray(b.areas) ? b.areas : []).map(Number)),
  ].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (
    !b.name ||
    !/^\S+@\S+\.\S+$/.test(b.email) ||
    !roles.includes(b.role) ||
    String(b.password).length < 14 ||
    String(b.password).length > 128 ||
    !/[a-z]/.test(String(b.password)) ||
    !/[A-Z]/.test(String(b.password)) ||
    !/\d/.test(String(b.password)) ||
    !/[^A-Za-z0-9]/.test(String(b.password))
  )
    return NextResponse.json(
      {
        error:
          "Datos inválidos; la contraseña debe tener entre 14 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo.",
      },
      { status: 400 },
    );
  if (b.role === "verificador" && !selectedAreas.length)
    return NextResponse.json(
      { error: "Un verificador debe tener al menos un área autorizada." },
      { status: 400 },
    );
  if (selectedAreas.length) {
    const validAreas = await get(
      "SELECT count(*)::int n FROM areas WHERE active=1 AND id=ANY(?::bigint[])",
      selectedAreas,
    );
    if (Number(validAreas?.n || 0) !== selectedAreas.length)
      return NextResponse.json({ error: "Área inválida." }, { status: 400 });
  }
  try {
    const id = await transaction(async () => {
      const x = await run(
        "INSERT INTO users(name,email,password_hash,role,active,must_change_password) VALUES(?,?,?,?,1,1) RETURNING id",
        b.name.slice(0, 120),
        b.email.toLowerCase().slice(0, 160),
        bcrypt.hashSync(b.password, 12),
        b.role,
      );
      const id = Number(x.lastInsertRowid);
      for (const area of selectedAreas)
        await run(
          "INSERT INTO user_areas(user_id,area_id) VALUES(?,?) ON CONFLICT DO NOTHING",
          id,
          Number(area),
        );
      await audit({
        userId: user.id,
        action: "USER_CREATE",
        entityType: "user",
        entityId: id,
        after: { name: b.name, email: b.email, role: b.role, areas: selectedAreas },
      });
      return id;
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "El correo ya existe." },
      { status: 409 },
    );
  }
}

export async function PATCH(req) {
  const user = await currentUser();
  if (!can(user, "admin"))
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json({ error: "Usuario inválido." }, { status: 400 });
  const target = await get("SELECT id,role,active,mfa_enabled FROM users WHERE id=?", id);
  if (!target)
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (id === Number(user.id))
    return NextResponse.json(
      { error: "No puede alterar su propia cuenta desde administración." },
      { status: 409 },
    );
  if (body.action === "reset_mfa") {
    await transaction(async () => {
      await run(
        "UPDATE users SET mfa_enabled=0,mfa_secret=NULL,mfa_pending_secret=NULL,mfa_last_counter=NULL,recovery_codes='[]',session_version=session_version+1 WHERE id=?",
        id,
      );
      await audit({
        userId: user.id,
        action: "MFA_ADMIN_RESET",
        entityType: "user",
        entityId: id,
        before: { mfa_enabled: Boolean(target.mfa_enabled) },
        after: { mfa_enabled: false, sessions_revoked: true },
      });
    });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "reset_password") {
    const temporaryPassword = `${crypto.randomBytes(18).toString("base64url")}aA1!`;
    await transaction(async () => {
      await run(
        "UPDATE users SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP,must_change_password=1,session_version=session_version+1 WHERE id=?",
        bcrypt.hashSync(temporaryPassword, 12),
        id,
      );
      await audit({
        userId: user.id,
        action: "PASSWORD_ADMIN_RESET",
        entityType: "user",
        entityId: id,
        after: { temporary_password_issued: true, sessions_revoked: true },
      });
    });
    return NextResponse.json({ ok: true, temporaryPassword });
  }
  if (!['activate', 'deactivate'].includes(body.action))
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  if (body.action === "deactivate" && target.role === "admin") {
    const activeAdmins = await get(
      "SELECT count(*)::int n FROM users WHERE role='admin' AND active=1",
    );
    if (Number(activeAdmins?.n || 0) <= 1)
      return NextResponse.json(
        { error: "No puede desactivar al último administrador activo." },
        { status: 409 },
      );
  }
  const active = body.action === "activate" ? 1 : 0;
  await transaction(async () => {
    await run(
      "UPDATE users SET active=?,session_version=session_version+1 WHERE id=?",
      active,
      id,
    );
    await audit({
      userId: user.id,
      action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      entityType: "user",
      entityId: id,
      before: { active: Boolean(target.active) },
      after: { active: Boolean(active), sessions_revoked: true },
    });
  });
  return NextResponse.json({ ok: true });
}
