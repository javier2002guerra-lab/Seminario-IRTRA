import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import path from "node:path";
import { uploadDirectory, validateFile } from "../lib/files.js";
const png = await sharp({
  create: { width: 200, height: 200, channels: 3, background: "white" },
})
  .png()
  .toBuffer();
test("acepta PNG válido", async () =>
  assert.equal(
    (await validateFile("encuesta.png", "image/png", png)).ext,
    "png",
  ));
test("rechaza extensión falsa", async () =>
  await assert.rejects(
    validateFile("ataque.pdf", "application/pdf", png),
    /contenido real/,
  ));
test("rechaza MIME discordante", async () =>
  await assert.rejects(validateFile("foto.png", "image/jpeg", png), /MIME/));
test("rechaza archivo vacío", async () =>
  await assert.rejects(
    validateFile("foto.png", "image/png", Buffer.alloc(0)),
    /vacío/,
  ));
test("rechaza archivo demasiado grande", async () =>
  await assert.rejects(
    validateFile(
      "foto.png",
      "image/png",
      Buffer.concat([png, Buffer.alloc(200)]),
      100,
    ),
    /supera/,
  ));
test("rechaza PDF corrupto con cabecera aparente", async () =>
  await assert.rejects(
    validateFile("roto.pdf", "application/pdf", Buffer.from("%PDF-1.7 basura")),
    /corrupto/,
  ));
test("rechaza PDF con JavaScript o acciones activas", async () =>
  await assert.rejects(
    validateFile(
      "activo.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.7\n1 0 obj <</JavaScript /OpenAction>> endobj\n%%EOF"),
    ),
    /acciones activas/,
  ));
test("rechaza imagen ilegible con firma aparente", async () =>
  await assert.rejects(
    validateFile(
      "ilegible.png",
      "image/png",
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        Buffer.alloc(300),
      ]),
    ),
    /ilegible/,
  ));
test("respeta UPLOAD_DIR también en modo producción", () => {
  const previous = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = "./private_uploads";
  assert.equal(
    uploadDirectory(),
    path.resolve(process.cwd(), "private_uploads"),
  );
  if (previous === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previous;
});
