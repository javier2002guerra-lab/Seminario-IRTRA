import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { get, run, audit } from "@/lib/db";
import { createSession, setSession } from "@/lib/auth";
import { clientIp, loginKey, accountLoginKey } from "@/lib/security";
const DUMMY_PASSWORD_HASH =
  "$2b$12$cCTzNkMCOWqYKoTBMifPKO09iTm181Y.ai7OO5KBjGcxI6uMZrU46";
export async function POST(req) {
  const ip = clientIp(req);
  let email, password;
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("invalid body");
    ({ email, password } = body);
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (String(email || "").length > 160 || String(password || "").length > 128)
    return NextResponse.json(
      { error: "Credenciales incorrectas." },
      { status: 401 },
    );
  const key = loginKey(ip, email),
    accountKey = accountLoginKey(email);
  const entry = await get(
    "SELECT failures,blocked_until FROM login_attempts WHERE key IN (?,?) ORDER BY blocked_until DESC NULLS LAST LIMIT 1",
    key,
    accountKey,
  );
  if (entry?.blocked_until && new Date(entry.blocked_until) > new Date())
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 },
    );
  const user = await get(
    "SELECT * FROM users WHERE lower(email)=lower(?) AND active=1",
    String(email || ""),
  );
  const passwordMatches = await bcrypt.compare(
    String(password || ""),
    user?.password_hash || DUMMY_PASSWORD_HASH,
  );
  if (!user || !passwordMatches) {
    const failures = Number(entry?.failures || 0) + 1;
    const minutes = failures >= 10 ? 60 : failures >= 5 ? 15 : 0;
    for (const attemptKey of [key, accountKey])
      await run(
        "INSERT INTO login_attempts(key,failures,blocked_until,last_attempt_at) VALUES(?,?,CASE WHEN ?>0 THEN CURRENT_TIMESTAMP + (? * INTERVAL '1 minute') ELSE NULL END,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET failures=login_attempts.failures+1,blocked_until=CASE WHEN login_attempts.failures+1>=10 THEN CURRENT_TIMESTAMP+INTERVAL '60 minutes' WHEN login_attempts.failures+1>=5 THEN CURRENT_TIMESTAMP+INTERVAL '15 minutes' ELSE login_attempts.blocked_until END,last_attempt_at=CURRENT_TIMESTAMP",
        attemptKey,
        failures,
        minutes,
        minutes,
      );
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
  await run("DELETE FROM login_attempts WHERE key IN (?,?)", key, accountKey);
  const sessionUser = await get(
    "UPDATE users SET session_version=session_version+1 WHERE id=? RETURNING *",
    user.id,
  );
  await setSession(await createSession(sessionUser));
  await audit({
    userId: user.id,
    action: "LOGIN_SUCCESS",
    ip,
    after: { previous_sessions_closed: true },
  });
  return NextResponse.json({ ok: true });
}
