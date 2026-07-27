import crypto from "node:crypto";
export function clientIp(req) {
  const forwarded = process.env.TRUST_PROXY === "true" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
  return (forwarded || req.headers.get("x-real-ip") || "local").slice(0, 64);
}
export function loginKey(ip, email) {
  return crypto.createHash("sha256").update(`${ip}|${String(email).trim().toLowerCase()}`).digest("hex");
}
export function validateProductionSecurity() {
  if (process.env.NODE_ENV !== "production") return;
  for (const name of ["SESSION_SECRET", "CSRF_SECRET"]) {
    const value = process.env[name] || "";
    if (value.length < 43 || /reemplazar|cambiar|solo-desarrollo/i.test(value)) throw new Error(`${name} debe contener al menos 256 bits de entropía.`);
  }
  if (process.env.COOKIE_SECURE !== "true") throw new Error("COOKIE_SECURE=true es obligatorio en producción.");
}
