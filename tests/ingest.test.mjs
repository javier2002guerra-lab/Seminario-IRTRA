import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ingestSurvey } from "../lib/ingest.js";
import { get, run, transaction } from "../lib/db.js";
import { removeOriginal } from "../lib/files.js";

test("ingiere, persiste y limpia un documento ficticio sin servicio externo", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const buffer = await sharp({
    create: {
      width: 240,
      height: 240,
      channels: 3,
      background: {
        r: 20 + Math.floor(Math.random() * 200),
        g: 80,
        b: 120,
      },
    },
  })
    .png()
    .toBuffer();
  let result;
  try {
    result = await ingestSurvey({
      name: "auditoria-integracion.png",
      type: "image/png",
      buffer,
      source: "auditoria-local",
    });
    const row = await get(
      "SELECT status,validation_status,needs_review,size FROM surveys WHERE id=?",
      result.id,
    );
    assert.equal(row.status, "Pendiente de revisión");
    assert.equal(row.validation_status, "Pendiente de revisión");
    assert.equal(row.needs_review, 1);
    assert.equal(Number(row.size), buffer.length);
  } finally {
    if (result?.id) {
      const row = await get(
        "SELECT stored_name FROM surveys WHERE id=?",
        result.id,
      );
      await transaction(async () => {
        await run("DELETE FROM survey_areas WHERE survey_id=?", result.id);
        await run("DELETE FROM service_ratings WHERE survey_id=?", result.id);
        await run("DELETE FROM survey_files WHERE survey_id=?", result.id);
        await run("DELETE FROM surveys WHERE id=?", result.id);
      });
      if (row) removeOriginal(row.stored_name);
    }
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
