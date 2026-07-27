import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { get, run, audit } from "@/lib/db";
import { createSession, setSession } from "@/lib/auth";
import { clientIp, loginKey } from "@/lib/security";
const DUMMY_PASSWORD_HASH = "$2b$12$cCTzNkMCOWqYKoTBMifPKO09iTm181Y.ai7OO5KBjGcxI6uMZrU46";
export async function POST(req) {
  const ip = clientIp(req);
  const { email, password } = await req.json();
  const key = loginKey(ip, email);
  const entry = await get("SELECT failures,blocked_until FROM login_attempts WHERE key=?", key);
  if (entry?.blocked_until && new Date(entry.blocked_until) > new Date())
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  const user = await get(
    "SELECT * FROM users WHERE lower(email)=lower(?) AND active=1",
    String(email || ""),
  );
  const passwordMatches = await bcrypt.compare(String(password || ""), user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    const failures = Number(entry?.failures || 0) + 1;
    const minutes = failures >= 10 ? 60 : failures >= 5 ? 15 : 0;
    await run("INSERT INTO login_attempts(key,failures,blocked_until,last_attempt_at) VALUES(?,?,CASE WHEN ?>0 THEN CURRENT_TIMESTAMP + (? * INTERVAL '1 minute') ELSE NULL END,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET failures=EXCLUDED.failures,blocked_until=EXCLUDED.blocked_until,last_attempt_at=CURRENT_TIMESTAMP", key, failures, minutes, minutes);
    await audit({
      action: "LOGIN_FAILED",
      ip,
      after: { email: String(email || "").slice(0, 80) },
    });
    return NextResponse.json(
      { error: "Credenciales incorrectas." },
      { status: 401 },
    );
  }
  await run("DELETE FROM login_attempts WHERE key=?", key);
  await setSession(await createSession(user));
  await audit({ userId: user.id, action: "LOGIN_SUCCESS", ip });
  return NextResponse.json({ ok: true });
}
