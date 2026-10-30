import { SignJWT, jwtVerify } from "jose";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { get } from "./db.js";

const COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-irtra_session"
    : "irtra_session";
const ISSUER = "irtra-encuestas";
const AUDIENCE = "irtra-web";
const MFA_AUDIENCE = "irtra-mfa";
const MFA_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-irtra_mfa_pending"
    : "irtra_mfa_pending";
function secret() {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ||
      "solo-desarrollo-cambiar-secreto-de-64-caracteres-antes-de-produccion",
  );
}
export async function createSession(user) {
  return new SignJWT({
    sub: String(user.id),
    role: user.role,
    name: user.name,
    sv: Number(user.session_version || 1),
    amr: ["pwd", "otp"],
    password_change_required: Boolean(user.must_change_password),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(process.env.SESSION_TTL || "8h")
    .sign(secret());
}
export async function createPendingMfaSession(user) {
  return new SignJWT({
    sub: String(user.id),
    sv: Number(user.session_version || 1),
    purpose: "mfa",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime("10m")
    .sign(secret());
}
export async function setSession(token) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.COOKIE_SECURE === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
    priority: "high",
  });
}
export async function setPendingMfaSession(token) {
  const jar = await cookies();
  jar.set(MFA_COOKIE, token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.COOKIE_SECURE === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
    priority: "high",
  });
}
export async function clearPendingMfaSession() {
  (await cookies()).delete(MFA_COOKIE);
}
export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
export async function currentUser() {
  try {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return (
      (await get(
        "SELECT id,name,email,role,active,session_version,mfa_enabled,must_change_password FROM users WHERE id=? AND active=1 AND session_version=?",
        Number(payload.sub),
        Number(payload.sv || 1),
      )) || null
    );
  } catch {
    return null;
  }
}
export async function pendingMfaUser() {
  try {
    const token = (await cookies()).get(MFA_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: MFA_AUDIENCE,
    });
    if (payload.purpose !== "mfa") return null;
    return (
      (await get(
        "SELECT id,name,email,role,active,session_version,mfa_enabled,mfa_secret,mfa_pending_secret,mfa_last_counter,recovery_codes,must_change_password FROM users WHERE id=? AND active=1 AND session_version=?",
        Number(payload.sub),
        Number(payload.sv || 1),
      )) || null
    );
  } catch {
    return null;
  }
}
export function csrfToken(session = "anonymous") {
  return crypto
    .createHmac(
      "sha256",
      Buffer.from(process.env.CSRF_SECRET || "cambiar-csrf-secret"),
    )
    .update(session)
    .digest("hex");
}
export { can } from "./access.js";
