import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  accountLoginKey,
  clientIp,
  isValidId,
  loginKey,
  validateProductionSecurity,
} from "../lib/security.js";
import { can } from "../lib/access.js";

test("las llaves de bloqueo no exponen correo ni dirección IP", () => {
  const combined = loginKey("203.0.113.10", "persona@example.com");
  const account = accountLoginKey("persona@example.com");
  assert.match(combined, /^[a-f0-9]{64}$/);
  assert.match(account, /^[a-f0-9]{64}$/);
  assert.notEqual(combined, account);
  assert.equal(accountLoginKey(" PERSONA@example.com "), account);
});

test("solo acepta identificadores enteros positivos seguros", () => {
  for (const value of [1, "42", Number.MAX_SAFE_INTEGER])
    assert.equal(isValidId(value), true);
  for (const value of [0, -1, "1 OR 1=1", "NaN", 1.5, Number.MAX_VALUE])
    assert.equal(isValidId(value), false);
});

test("un verificador no obtiene privilegios administrativos", () => {
  assert.equal(can({ role: "verificador" }, "admin"), false);
  assert.equal(can({ role: "verificador" }, "verificador"), true);
  assert.equal(can({ role: "admin" }, "admin"), true);
  for (const relative of [
    "../app/api/admin/users/route.js",
    "../app/api/admin/areas/route.js",
  ]) {
    const route = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.match(route, /can\(user, "admin"\)/);
  }
});

test("la política CSP no permite scripts inline sin nonce", () => {
  const proxy = fs.readFileSync(
    new URL("../proxy.js", import.meta.url),
    "utf8",
  );
  assert.match(proxy, /script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.doesNotMatch(proxy, /script-src[^"\n]*'unsafe-inline'/);
  assert.match(proxy, /NODE_ENV === "production" \? "" : " 'unsafe-eval'"/);
  assert.match(proxy, /object-src 'none'/);
});

test("no confía en cabeceras de IP sin un proxy autorizado", () => {
  const previous = process.env.TRUST_PROXY;
  const req = {
    headers: new Headers({
      "x-forwarded-for": "203.0.113.8",
      "x-real-ip": "203.0.113.9",
    }),
  };
  delete process.env.TRUST_PROXY;
  assert.equal(clientIp(req), "local");
  req.headers.set("x-irtra-remote-address", "127.0.0.1");
  assert.equal(clientIp(req), "127.0.0.1");
  process.env.TRUST_PROXY = "true";
  assert.equal(clientIp(req), "203.0.113.8");
  if (previous === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = previous;
});

test("la descarga de originales aplica sandbox incluso en vista previa", () => {
  const route = fs.readFileSync(
    new URL("../app/api/surveys/[id]/file/route.js", import.meta.url),
    "utf8",
  );
  assert.match(route, /content-security-policy[^\n]*sandbox; default-src 'none'/);
  assert.match(route, /x-content-type-options[^\n]*nosniff/);
});

test("el almacenamiento externo no fuerza a empaquetar todo el proyecto", () => {
  const files = fs.readFileSync(
    new URL("../lib/files.js", import.meta.url),
    "utf8",
  );
  assert.match(files, /path\.resolve\(\/\* turbopackIgnore: true \*\//);
  assert.match(files, /path\.join\(\/\* turbopackIgnore: true \*\/ dir/);
});

test("la retención elimina también los datos de recuperación del huésped", () => {
  const retention = fs.readFileSync(
    new URL("../scripts/retention.mjs", import.meta.url),
    "utf8",
  );
  assert.match(retention, /DELETE FROM guest_recovery WHERE survey_id=/);
});

test("producción rechaza una contraseña inicial ausente", () => {
  const names = [
    "NODE_ENV",
    "SESSION_SECRET",
    "CSRF_SECRET",
    "MFA_ENCRYPTION_KEY",
    "COOKIE_SECURE",
    "DATABASE_URL",
    "TRUST_PROXY",
    "OPENAI_API_KEY",
    "EXTERNAL_AI_ENABLED",
    "EXTERNAL_AI_PII_APPROVED",
    "FILE_SCAN_MODE",
    "CLAMAV_HOST",
    "PGSSL_MODE",
    "APP_BASE_URL",
    "SUPERUSER_PASSWORD",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, {
    NODE_ENV: "production",
    SESSION_SECRET: "s".repeat(64),
    CSRF_SECRET: "c".repeat(64),
    MFA_ENCRYPTION_KEY: "m".repeat(64),
    COOKIE_SECURE: "true",
    DATABASE_URL: "postgresql://example.invalid/db",
    TRUST_PROXY: "true",
    OPENAI_API_KEY: "configured-for-validation",
    EXTERNAL_AI_ENABLED: "false",
    EXTERNAL_AI_PII_APPROVED: "false",
    FILE_SCAN_MODE: "clamav",
    CLAMAV_HOST: "127.0.0.1",
    PGSSL_MODE: "require",
    APP_BASE_URL: "https://example.invalid",
  });
  delete process.env.SUPERUSER_PASSWORD;
  assert.throws(validateProductionSecurity, /SUPERUSER_PASSWORD/);
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

test("el formulario de acceso nunca degrada a un GET con credenciales", () => {
  const login = fs.readFileSync(
    new URL("../app/login/page.js", import.meta.url),
    "utf8",
  );
  assert.match(login, /<form className="login-card" method="post"/);
  assert.doesNotMatch(login, /defaultValue="admin@/);
});

test("los secretos locales y certificados están excluidos de Git", () => {
  const ignore = fs.readFileSync(
    new URL("../.gitignore", import.meta.url),
    "utf8",
  );
  for (const rule of [".env", ".env.local", "*.key", "*.p12", "*.pfx"])
    assert.ok(ignore.includes(rule), `Falta excluir ${rule}`);
});

test("el build elimina cachés que podrían conservar variables de entorno", () => {
  const pkg = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.scripts.postbuild, "node scripts/clean-build-cache.mjs");
  const cleaner = fs.readFileSync(
    new URL("../scripts/clean-build-cache.mjs", import.meta.url),
    "utf8",
  );
  assert.match(cleaner, /\["cache", "dev"\]/);
});
