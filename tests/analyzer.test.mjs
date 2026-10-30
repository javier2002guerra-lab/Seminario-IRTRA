import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSurvey, parseModelOutput } from "../lib/analyzer.js";
test("sin aprobación para IA externa obliga revisión humana", async () => {
  const old = {
    key: process.env.OPENAI_API_KEY,
    enabled: process.env.EXTERNAL_AI_ENABLED,
    approved: process.env.EXTERNAL_AI_PII_APPROVED,
  };
  delete process.env.OPENAI_API_KEY;
  process.env.EXTERNAL_AI_ENABLED = "false";
  process.env.EXTERNAL_AI_PII_APPROVED = "false";
  const r = await analyzeSurvey("no-necesario.png", "image/png");
  assert.equal(r.needs_review, true);
  assert.equal(r.model, "revision-humana-privacidad");
  assert.deepEqual(r.numbered_answers, {});
  for (const [name, value] of [
    ["OPENAI_API_KEY", old.key],
    ["EXTERNAL_AI_ENABLED", old.enabled],
    ["EXTERNAL_AI_PII_APPROVED", old.approved],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
test("rechaza respuesta inválida del modelo", () =>
  assert.throws(() => parseModelOutput('{"dato":true}'), /inválida/));
