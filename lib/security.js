import crypto from "node:crypto";
export function clientIp(req) {
  const forwarded =
    process.env.TRUST_PROXY === "true"
      ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : null;
  return (forwarded || req.headers.get("x-real-ip") || "local").slice(0, 64);
}
export function loginKey(ip, email) {
  return crypto
    .createHash("sha256")
    .update(`${ip}|${String(email).trim().toLowerCase()}`)
    .digest("hex");
}
export function accountLoginKey(email) {
  return crypto
    .createHash("sha256")
    .update(`account|${String(email).trim().toLowerCase()}`)
    .digest("hex");
}
export function isValidId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function validateProductionSecurity() {
  if (process.env.NODE_ENV !== "production") return;
  for (const name of ["SESSION_SECRET", "CSRF_SECRET"]) {
    const value = process.env[name] || "";
    if (value.length < 43 || /reemplazar|cambiar|solo-desarrollo/i.test(value))
      throw new Error(`${name} debe contener al menos 256 bits de entropía.`);
  }
  if (process.env.COOKIE_SECURE !== "true")
    throw new Error("COOKIE_SECURE=true es obligatorio en producción.");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL es obligatorio en producción.");
  if (process.env.TRUST_PROXY !== "true")
    throw new Error("TRUST_PROXY=true es obligatorio en producción.");
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      "OPENAI_API_KEY es obligatorio para validar documentos en producción.",
    );
  if (!String(process.env.APP_BASE_URL || "").startsWith("https://"))
    throw new Error("APP_BASE_URL debe usar HTTPS en producción.");
  // ALLOW_LOCAL_EMBED is a legacy Render variable. Embedding is disabled
  // unconditionally by next.config.mjs, so an old dashboard value must not
  // prevent a secure release from starting.
  const initialPassword = process.env.SUPERUSER_PASSWORD || "";
  if (
    initialPassword &&
    (initialPassword.length < 14 ||
      initialPassword.length > 128 ||
      !/[a-z]/.test(initialPassword) ||
      !/[A-Z]/.test(initialPassword) ||
      !/\d/.test(initialPassword) ||
      !/[^A-Za-z0-9]/.test(initialPassword))
  )
    throw new Error("SUPERUSER_PASSWORD no cumple la política de contraseñas.");
  const scannerToken = process.env.SCANNER_INGEST_TOKEN || "";
  if (scannerToken && scannerToken.length < 43)
    throw new Error("SCANNER_INGEST_TOKEN debe contener al menos 256 bits.");
}
