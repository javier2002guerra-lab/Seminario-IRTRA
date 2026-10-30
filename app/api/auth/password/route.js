import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { clearSession, currentUser } from "@/lib/auth";
import { audit, get, run, transaction } from "@/lib/db";
import { clientIp } from "@/lib/security";

function strongPassword(value) {
  const password = String(value || "");
  return (
    password.length >= 14 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function POST(req) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!strongPassword(body.newPassword))
    return NextResponse.json(
      {
        error:
          "La nueva contraseña debe tener 14–128 caracteres, mayúscula, minúscula, número y símbolo.",
      },
      { status: 400 },
    );
  if (String(body.currentPassword || "") === String(body.newPassword))
    return NextResponse.json(
      { error: "La nueva contraseña debe ser diferente." },
      { status: 400 },
    );
  const stored = await get("SELECT password_hash FROM users WHERE id=?", user.id);
  if (!stored || !(await bcrypt.compare(String(body.currentPassword || ""), stored.password_hash)))
    return NextResponse.json(
      { error: "La contraseña actual es incorrecta." },
      { status: 401 },
    );
  await transaction(async () => {
    await run(
      "UPDATE users SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP,must_change_password=0,session_version=session_version+1 WHERE id=?",
      bcrypt.hashSync(String(body.newPassword), 12),
      user.id,
    );
    await audit({
      userId: user.id,
      action: "PASSWORD_CHANGED",
      ip: clientIp(req),
      after: { all_sessions_revoked: true },
    });
  });
  await clearSession();
  return NextResponse.json({ ok: true, loginRequired: true });
}
