import crypto from "node:crypto";
import fs from "node:fs";

export const MANAGERIAL_TEMPLATE_SHA256 =
  "f02b110040bc40aeb6feb1bff6ca4ae2ba8e98399d368117913f019c122cb923";

export function verifyManagerialTemplate(file) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const expected = Buffer.from(MANAGERIAL_TEMPLATE_SHA256, "hex");
  const received = Buffer.from(actual, "hex");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received))
    throw new Error("La plantilla gerencial no coincide con la versión limpia aprobada.");
  return actual;
}
