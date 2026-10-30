import crypto from "node:crypto";
export function clientIp(req) {
  const forwarded = process.env.TRUST_PROXY === "true"
    ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")
    : null;
  return (
    forwarded || req.headers.get("x-irtra-remote-address") || "local"
  ).slice(0, 64);
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
export function validateProductionSecurity({ production = process.env.NODE_ENV === "production" } = {}) {
  if (!production) return;
  for (const name of ["SESSION_SECRET", "CSRF_SECRET"]) {
    const value = process.env[name] || "";
    if (value.length < 43 || /reemplazar|cambiar|solo-desarrollo/i.test(value))
      throw new Error(`${name} debe contener al menos 256 bits de entropía.`);
  }
  const mfaKey = process.env.MFA_ENCRYPTION_KEY || "";
  if (
    mfaKey.length < 43 ||
    /reemplazar|cambiar|solo-desarrollo/i.test(mfaKey) ||
    [process.env.SESSION_SECRET, process.env.CSRF_SECRET].includes(mfaKey)
  )
    throw new Error(
      "MFA_ENCRYPTION_KEY debe ser independiente y contener al menos 256 bits de entropía.",
    );
  if (process.env.COOKIE_SECURE !== "true")
    throw new Error("COOKIE_SECURE=true es obligatorio en producción.");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL es obligatorio en producción.");
  const databaseHost = new URL(process.env.DATABASE_URL).hostname;
  if (
    !/^(localhost|127\.0\.0\.1)$/i.test(databaseHost) &&
    !["require", "verify-full"].includes(process.env.PGSSL_MODE)
  )
    throw new Error(
      "PGSSL_MODE=require o verify-full es obligatorio para PostgreSQL remoto.",
    );
  if (process.env.FILE_SCAN_MODE !== "clamav")
    throw new Error("FILE_SCAN_MODE=clamav es obligatorio en producción.");
  if (!process.env.CLAMAV_HOST)
    throw new Error("CLAMAV_HOST es obligatorio en producción.");
  if (
    process.env.EXTERNAL_AI_ENABLED === "true" &&
    !process.env.OPENAI_API_KEY
  )
    throw new Error(
      "OPENAI_API_KEY es obligatoria cuando EXTERNAL_AI_ENABLED=true.",
    );
  if (
    process.env.EXTERNAL_AI_ENABLED === "true" &&
    process.env.EXTERNAL_AI_PII_APPROVED !== "true"
  )
    throw new Error(
      "EXTERNAL_AI_PII_APPROVED=true requiere aprobación formal antes de enviar documentos.",
    );
  if (!String(process.env.APP_BASE_URL || "").startsWith("https://"))
    throw new Error("APP_BASE_URL debe usar HTTPS en producción.");
  // ALLOW_LOCAL_EMBED is a legacy Render variable. Embedding is disabled
  // unconditionally by next.config.mjs, so an old dashboard value must not
  // prevent a secure release from starting.
  const initialPassword = process.env.SUPERUSER_PASSWORD || "";
  if (
    !initialPassword ||
    initialPassword.length < 14 ||
      initialPassword.length > 128 ||
      !/[a-z]/.test(initialPassword) ||
      !/[A-Z]/.test(initialPassword) ||
      !/\d/.test(initialPassword) ||
      !/[^A-Za-z0-9]/.test(initialPassword)
  )
    throw new Error(
      "SUPERUSER_PASSWORD es obligatoria y debe cumplir la política de contraseñas.",
    );
  const scannerToken = process.env.SCANNER_INGEST_TOKEN || "";
  if (scannerToken && scannerToken.length < 43)
    throw new Error("SCANNER_INGEST_TOKEN debe contener al menos 256 bits.");
}
