import test from "node:test";
import assert from "node:assert/strict";
import { parseModelOutput, analyzeSurvey } from "../lib/analyzer.js";
import { requiresReview } from "../lib/policy.js";

function valid() {
  return {
    is_survey: true, survey_validation_reason: "Formulario con preguntas 1 a 14",
    category: "Queja", priority: "Alto", priority_reason: "Comida fría", confidence: 0.94,
    summary: "Comida fría", primary_topic: "Comida", secondary_topics: [], areas: ["Restaurantes"],
    negative_comments: ["Comida fría"], extraction_warnings: [],
    general_data: Object.fromEntries(["document_number", "visitor_name", "affiliate_status", "visit_date", "email", "phone", "room_number", "visit_reason", "restaurant", "hotel"].map(key => [key, key === "document_number" ? "000018" : null])),
    numbered_answers: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`item_${i + 1}`, i === 8 ? "Comida fría" : null])),
    service_ratings: [{ service: "Calidad de comida", rating: "Malo", score: 5, negative: false }],
    classification_evidence: [{ source: "Pregunta 9", text: "Comida fría" }],
  };
}
test("conserva ceros iniciales, valores nulos y transcripción; deriva el puntaje de la opción", () => {
  const result = parseModelOutput(JSON.stringify(valid()), ["Restaurantes"]);
  assert.equal(result.general_data.document_number, "000018");
  assert.equal(result.numbered_answers.item_1, null);
  assert.deepEqual(result.service_ratings[0], { service: "Calidad de comida", rating: "Malo", score: 1, negative: true });
});
for (const [name, mutate] of [
  ["confianza fuera de rango", r => { r.confidence = 1.01; }],
  ["confianza textual", r => { r.confidence = "0.99"; }],
  ["categoría inventada", r => { r.category = "Excelente"; }],
  ["prioridad inventada", r => { r.priority = "Urgente"; }],
  ["tipo de documento ambiguo", r => { r.is_survey = "true"; }],
  ["pregunta omitida", r => { delete r.numbered_answers.item_14; }],
  ["dato general numérico", r => { r.general_data.document_number = 18; }],
  ["área no autorizada", r => { r.areas = ["Inventada"]; }],
  ["opción de servicio inventada", r => { r.service_ratings[0].rating = "Perfecto"; }],
  ["servicio duplicado", r => { r.service_ratings.push({ ...r.service_ratings[0] }); }],
  ["evidencia sin texto", r => { r.classification_evidence[0].text = ""; }],
]) test(`rechaza ${name}`, () => {
  const result = valid(); mutate(result);
  assert.throws(() => parseModelOutput(JSON.stringify(result), ["Restaurantes"]), /inválida/);
});
test("advertencias, evidencia ausente y confianza indefinida obligan revisión", () => {
  const result = valid(); result.classification_evidence = [];
  assert.equal(requiresReview(parseModelOutput(JSON.stringify(result))), true);
  assert.equal(requiresReview({ priority: "Bajo", confidence: NaN, areas: ["Restaurantes"] }), true);
  assert.equal(requiresReview({ priority: "Bajo", confidence: 1, areas: [] }), true);
  assert.equal(requiresReview({ ...valid(), extraction_warnings: ["Manuscrito ambiguo"] }), true);
});
test("el modo de revisión humana devuelve datos independientes entre documentos", async () => {
  const old = process.env.EXTERNAL_AI_ENABLED;
  process.env.EXTERNAL_AI_ENABLED = "false";
  try {
    const first = await analyzeSurvey("a.png", "image/png");
    first.numbered_answers.item_1 = "no debe filtrarse";
    const next = await analyzeSurvey("b.png", "image/png");
    assert.deepEqual(next.numbered_answers, {});
  } finally { if (old === undefined) delete process.env.EXTERNAL_AI_ENABLED; else process.env.EXTERNAL_AI_ENABLED = old; }
});
