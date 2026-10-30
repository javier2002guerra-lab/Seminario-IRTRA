import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { executiveData } from "../lib/executive.js";
import { run, transaction, closeDatabase } from "../lib/db.js";
after(() => closeDatabase());
test("excluye errores de indicadores y no convierte felicitaciones en problemas a corregir", async () => {
  const rollback = new Error("ROLLBACK_EXECUTIVE_QA");
  await assert.rejects(transaction(async () => {
    for (const [category, topic, status] of [
      ["Felicitación", "Excelente atención", "Procesado"],
      ["Felicitación", "Excelente atención", "Procesado"],
      ["Queja", "Comida fría", "Procesado"],
      ["Queja", "Error técnico", "Error"],
    ]) {
      const uuid = crypto.randomUUID();
      const inserted = await run("INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,primary_topic,created_at) VALUES(?,?,'image/png',100,?,?,?,?,?::timestamptz) RETURNING id", `exec-${uuid}.png`, `exec-${uuid}.png`, uuid, status, category, topic, "2101-06-15T12:00:00Z");
      if (category === "Felicitación") await run("INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,'Cortesía del personal','Excelente',5,0)", inserted.lastInsertRowid);
    }
    const data = await executiveData({ from: "2101-06-01", to: "2101-06-30" });
    assert.equal(data.summary.total, 3);
    assert.equal(data.summary.complaints, 1);
    assert.equal(data.kpis.complaintRate, 33);
    assert.equal(data.topics[0].label, "Excelente atención");
    assert(data.recommendations.some(text => text.includes("Comida fría")));
    assert(!data.recommendations.some(text => text.includes("Excelente atención") || text.includes("0 calificaciones negativas")));
    assert.equal(data.history.at(-1).total, 3);
    throw rollback;
  }), error => error === rollback);
});
