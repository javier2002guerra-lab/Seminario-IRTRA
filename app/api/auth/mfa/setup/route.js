import { NextResponse } from "next/server";
import { audit, run } from "@/lib/db";
import { pendingMfaUser } from "@/lib/auth";
import {
  encryptMfaSecret,
  generateMfaSecret,
  otpauthUri,
} from "@/lib/mfa";
import { clientIp } from "@/lib/security";

export async function POST(req) {
  const user = await pendingMfaUser();
  if (!user)
    return NextResponse.json({ error: "Desafío expirado." }, { status: 401 });
  if (user.mfa_enabled)
    return NextResponse.json(
      { error: "MFA ya está configurado." },
      { status: 409 },
    );
  const secret = generateMfaSecret();
  await run(
    "UPDATE users SET mfa_pending_secret=? WHERE id=? AND mfa_enabled=0",
    encryptMfaSecret(secret),
    user.id,
  );
  await audit({
    userId: user.id,
    action: "MFA_ENROLLMENT_STARTED",
    ip: clientIp(req),
  });
  return NextResponse.json({
    secret,
    uri: otpauthUri({ secret, email: user.email }),
  });
}
