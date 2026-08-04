import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { accountLoginKey, isValidId, loginKey } from "../lib/security.js";

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

test("la política CSP no permite scripts inline sin nonce", () => {
  const proxy = fs.readFileSync(
    new URL("../proxy.js", import.meta.url),
    "utf8",
  );
  assert.match(proxy, /script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.doesNotMatch(proxy, /script-src[^"\n]*'unsafe-inline'/);
  assert.match(proxy, /object-src 'none'/);
});

test("los secretos locales y certificados están excluidos de Git", () => {
  const ignore = fs.readFileSync(
    new URL("../.gitignore", import.meta.url),
    "utf8",
  );
  for (const rule of [".env", ".env.local", "*.key", "*.p12", "*.pfx"])
    assert.ok(ignore.includes(rule), `Falta excluir ${rule}`);
});
