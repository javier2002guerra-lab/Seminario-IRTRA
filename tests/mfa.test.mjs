import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  recoveryCodeHash,
  totpAt,
  verifyTotp,
} from "../lib/mfa.js";

test("TOTP coincide con el vector RFC 6238", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpAt(secret, 59000, 8), "94287082");
});

test("MFA cifra el secreto y rechaza reutilizar un contador", () => {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = "m".repeat(64);
  try {
    const secret = generateMfaSecret();
    const encrypted = encryptMfaSecret(secret);
    assert.notEqual(encrypted, secret);
    assert.equal(decryptMfaSecret(encrypted), secret);
    const now = 1_800_000_000_000;
    const token = totpAt(secret, now);
    const counter = verifyTotp(secret, token, { now });
    assert.equal(counter, Math.floor(now / 30000));
    assert.equal(verifyTotp(secret, token, { now, lastCounter: counter }), null);
  } finally {
    if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previous;
  }
});

test("los códigos de recuperación son únicos y se almacenan con hash", () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    assert.match(recoveryCodeHash(code), /^[a-f0-9]{64}$/);
  }
});
