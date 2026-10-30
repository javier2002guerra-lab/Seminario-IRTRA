import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(input) {
  const bytes = Buffer.from(input);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of String(value).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Secreto MFA inválido.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateMfaSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpAt(secret, timestamp = Date.now(), digits = 6) {
  const counter = Math.floor(Number(timestamp) / 30000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function verifyTotp(secret, token, { now = Date.now(), window = 1, lastCounter = -1 } = {}) {
  const supplied = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(supplied)) return null;
  const current = Math.floor(Number(now) / 30000);
  for (let delta = -window; delta <= window; delta++) {
    const counter = current + delta;
    if (counter <= Number(lastCounter)) continue;
    const expected = totpAt(secret, counter * 30000);
    if (crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))
      return counter;
  }
  return null;
}

function encryptionKey() {
  const source =
    process.env.MFA_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    "solo-desarrollo-clave-mfa-no-usar-en-produccion";
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptMfaSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptMfaSecret(value) {
  const [version, iv, tag, encrypted] = String(value || "").split(":");
  if (version !== "v1" || !iv || !tag || !encrypted)
    throw new Error("Secreto MFA cifrado inválido.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function recoveryCodeHash(code) {
  return crypto
    .createHmac("sha256", encryptionKey())
    .update(`recovery:${String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}`)
    .digest("hex");
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(crypto.randomBytes(8)).slice(0, 12);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

export function otpauthUri({ secret, email }) {
  const issuer = "IRTRA Encuestas";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
