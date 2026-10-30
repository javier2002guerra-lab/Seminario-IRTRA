import { NextResponse } from "next/server";
import {
  clearPendingMfaSession,
  createSession,
  pendingMfaUser,
  setSession,
} from "@/lib/auth";
import { audit, consumeRateLimit, get, run, transaction } from "@/lib/db";
import {
  decryptMfaSecret,
  generateRecoveryCodes,
  recoveryCodeHash,
  verifyTotp,
} from "@/lib/mfa";
import { clientIp, loginKey } from "@/lib/security";

export async function POST(req) {
  const user = await pendingMfaUser();
  if (!user)
    return NextResponse.json({ error: "Desafío expirado." }, { status: 401 });
  let code;
  try {
    const body = await req.json();
    code = String(body?.code || "").trim();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const ip = clientIp(req);
  const limited = await consumeRateLimit(
    `mfa:${loginKey(ip, user.email)}`,
    10,
    600,
  );
  if (limited)
    return NextResponse.json(
      { error: "Demasiados intentos. Espera diez minutos." },
      { status: 429 },
    );

  try {
    if (!user.mfa_enabled) {
      if (!user.mfa_pending_secret)
        return NextResponse.json(
          { error: "Inicia nuevamente la configuración MFA." },
          { status: 409 },
        );
      const secret = decryptMfaSecret(user.mfa_pending_secret);
      const counter = verifyTotp(secret, code);
      if (counter === null) throw new Error("invalid");
      const recoveryCodes = generateRecoveryCodes();
      await transaction(async () => {
        const changed = await run(
          "UPDATE users SET mfa_enabled=1,mfa_secret=mfa_pending_secret,mfa_pending_secret=NULL,mfa_last_counter=?,recovery_codes=? WHERE id=? AND mfa_enabled=0 RETURNING id",
          counter,
          JSON.stringify(recoveryCodes.map(recoveryCodeHash)),
          user.id,
        );
        if (!changed.rowCount) throw new Error("MFA ya fue configurado.");
        await audit({
          userId: user.id,
          action: "MFA_ENROLLED",
          ip,
          after: { recovery_codes_issued: recoveryCodes.length },
        });
      });
      const fresh = await get("SELECT * FROM users WHERE id=?", user.id);
      await setSession(await createSession(fresh));
      await clearPendingMfaSession();
      await audit({
        userId: user.id,
        action: "LOGIN_SUCCESS",
        ip,
        after: { method: "password+totp", enrollment: true },
      });
      return NextResponse.json({ ok: true, recoveryCodes });
    }

    let method = "totp";
    const normalizedRecovery = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z2-7]{12}$/.test(normalizedRecovery)) {
      const expected = recoveryCodeHash(normalizedRecovery);
      const hashes = JSON.parse(user.recovery_codes || "[]");
      const index = hashes.indexOf(expected);
      if (index < 0) throw new Error("invalid");
      hashes.splice(index, 1);
      const changed = await run(
        "UPDATE users SET recovery_codes=? WHERE id=? AND recovery_codes=? RETURNING id",
        JSON.stringify(hashes),
        user.id,
        user.recovery_codes,
      );
      if (!changed.rowCount) throw new Error("invalid");
      method = "recovery-code";
    } else {
      const counter = verifyTotp(decryptMfaSecret(user.mfa_secret), code, {
        lastCounter: user.mfa_last_counter ?? -1,
      });
      if (counter === null) throw new Error("invalid");
      const changed = await run(
        "UPDATE users SET mfa_last_counter=? WHERE id=? AND (mfa_last_counter IS NULL OR mfa_last_counter<?) RETURNING id",
        counter,
        user.id,
        counter,
      );
      if (!changed.rowCount) throw new Error("invalid");
    }
    const fresh = await get("SELECT * FROM users WHERE id=?", user.id);
    await setSession(await createSession(fresh));
    await clearPendingMfaSession();
    await audit({
      userId: user.id,
      action: "LOGIN_SUCCESS",
      ip,
      after: { method: `password+${method}` },
    });
    return NextResponse.json({ ok: true });
  } catch {
    await audit({
      userId: user.id,
      action: "MFA_FAILED",
      ip,
      after: { reason: "invalid_code" },
    });
    return NextResponse.json(
      { error: "Código de verificación incorrecto o ya utilizado." },
      { status: 401 },
    );
  }
}
