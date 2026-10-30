import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { scanFileBuffer } from "./malware-scan.js";
const signatures = {
  pdf: (b) => b.subarray(0, 5).toString() === "%PDF-",
  jpg: (b) =>
    b[0] === 0xff &&
    b[1] === 0xd8 &&
    b[b.length - 2] === 0xff &&
    b[b.length - 1] === 0xd9,
  png: (b) =>
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
};
const dangerousPdfTokens = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/OpenAction",
  "/AA",
  "/RichMedia",
];
export async function validateFile(name, type, buffer, max = 50 * 1024 * 1024) {
  const ext = path.extname(name).slice(1).toLowerCase(),
    normalized = ext === "jpeg" ? "jpg" : ext;
  if (!signatures[normalized]) throw new Error("Formato no permitido.");
  if (!buffer.length) throw new Error("El archivo está vacío.");
  if (buffer.length > max) throw new Error("El archivo supera 50 MB.");
  if (!signatures[normalized](buffer))
    throw new Error(
      "El contenido real no corresponde con la extensión o está corrupto.",
    );
  if (
    normalized === "pdf" &&
    !buffer
      .subarray(Math.max(0, buffer.length - 2048))
      .includes(Buffer.from("%%EOF"))
  )
    throw new Error("El PDF está corrupto o incompleto.");
  if (
    normalized === "pdf" &&
    dangerousPdfTokens.some((token) => buffer.includes(Buffer.from(token)))
  )
    throw new Error("El PDF contiene acciones activas o archivos incrustados no permitidos.");
  if (normalized !== "pdf") {
    try {
      const m = await sharp(buffer, {
        failOn: "error",
        limitInputPixels: 100_000_000,
      }).metadata();
      if (!m.width || !m.height || m.width < 100 || m.height < 100)
        throw new Error();
    } catch {
      throw new Error("La imagen es ilegible, inválida o demasiado pequeña.");
    }
  }
  const expected = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    png: "image/png",
  }[normalized];
  if (
    type &&
    type !== expected &&
    !(normalized === "jpg" && type === "image/jpg")
  )
    throw new Error("El tipo MIME no corresponde con el archivo.");
  await scanFileBuffer(buffer);
  return {
    ext: normalized,
    mime: expected,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}
export function saveOriginal(buffer, ext) {
  const dir = uploadDirectory();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(
    path.join(/* turbopackIgnore: true */ dir, name),
    buffer,
    { mode: 0o600 },
  );
  return name;
}

export function removeOriginal(stored) {
  const dir = uploadDirectory();
  const target = path.resolve(dir, path.basename(stored));
  if (path.dirname(target) !== dir) return;
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function uploadDirectory() {
  return path.resolve(/* turbopackIgnore: true */
    process.env.UPLOAD_DIR ||
      (process.env.NODE_ENV === "production"
        ? "/tmp/irtra-uploads"
        : path.join(process.cwd(), "private_uploads")),
  );
}
