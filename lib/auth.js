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
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(process.env.SESSION_TTL || "8h")
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
        "SELECT id,name,email,role,active,session_version FROM users WHERE id=? AND active=1 AND session_version=?",
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
export function can(user, ...roles) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "verificador") return roles.includes(user.role);
  return roles.some((role) =>
    [
      "verificador",
      "calidad",
      "responsable_area",
      "auditor",
      "administrador_tecnologias",
    ].includes(role),
  );
}
