import crypto from "node:crypto";
import fs from "node:fs";

export const MANAGERIAL_TEMPLATE_SHA256 =
  "c883132cd77a6945c51b4f3f0e377cd9dd5505e26aedcec054b8a43407ceb66f";

export function verifyManagerialTemplate(file) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const expected = Buffer.from(MANAGERIAL_TEMPLATE_SHA256, "hex");
  const received = Buffer.from(actual, "hex");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received))
    throw new Error("La plantilla gerencial no coincide con la versión limpia aprobada.");
  return actual;
}
