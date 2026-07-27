import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSurvey, parseModelOutput } from "../lib/analyzer.js";
test("sin API key obliga revisión humana", async () => {
  const old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const r = await analyzeSurvey("no-necesario.png", "image/png");
  assert.equal(r.needs_review, true);
  assert.equal(r.model, "sin-configurar");
  assert.deepEqual(r.numbered_answers, {});
  if (old) process.env.OPENAI_API_KEY = old;
});
test("rechaza respuesta inválida del modelo", () =>
  assert.throws(() => parseModelOutput('{"dato":true}'), /inválida/));
