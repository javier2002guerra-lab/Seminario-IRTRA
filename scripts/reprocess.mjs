import { get, run, audit, transaction, closeDatabase } from "../lib/db.js";
import { analyzeSurvey, PROMPT_VERSION } from "../lib/analyzer.js";
process.loadEnvFile?.(".env");
const id = Number(process.argv[2]);
if (!id) throw new Error("Uso: node scripts/reprocess.mjs <id>");
try {
  const record = await get("SELECT * FROM surveys WHERE id=?", id);
  if (!record) throw new Error(`Encuesta ${id} no encontrada.`);
  await run(
    "UPDATE surveys SET status='En procesamiento',updated_at=CURRENT_TIMESTAMP WHERE id=?",
    id,
  );
  console.log(`Analizando ${record.original_name} con OpenAI...`);
  const a = await analyzeSurvey(record.stored_name, record.mime_type);
  await transaction(async () => {
    await run("DELETE FROM survey_areas WHERE survey_id=?", id);
    await run("DELETE FROM service_ratings WHERE survey_id=?", id);
    await run(
      "UPDATE surveys SET status='Pendiente de revisión',category=?,priority=?,priority_reason=?,confidence=?,summary=?,primary_topic=?,secondary_topics=?,extracted_data=?,ai_original=?,model=?,prompt_version=?,needs_review=1,validation_status='Pendiente de revisión',restaurant=?,hotel=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      a.category,
      a.priority,
      a.priority_reason,
      a.confidence,
      a.summary,
      a.primary_topic,
      JSON.stringify(a.secondary_topics),
      JSON.stringify(a.extracted_data),
      JSON.stringify(a),
      a.model,
      PROMPT_VERSION,
      a.general_data?.restaurant || null,
      a.general_data?.hotel || null,
      id,
    );
    for (const name of a.areas) {
      const area = await get(
        "SELECT id FROM areas WHERE name=? AND active=1",
        name,
      );
      if (area)
        await run(
          "INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?) ON CONFLICT DO NOTHING",
          id,
          area.id,
        );
    }
    for (const s of a.service_ratings || [])
      await run(
        "INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)",
        id,
        s.service,
        s.rating,
        s.score,
        s.negative ? 1 : 0,
      );
    await audit({
      action: "AI_REPROCESS",
      entityType: "survey",
      entityId: id,
      after: { model: a.model, prompt: PROMPT_VERSION, result: a },
    });
  });
  console.log(
    `Completado: ${a.category}, prioridad ${a.priority}, confianza ${Math.round(a.confidence * 100)}%.`,
  );
} catch (error) {
  await run(
    "UPDATE surveys SET status='Error',needs_review=1,summary=? WHERE id=?",
    `Error de análisis: ${String(error.message).slice(0, 500)}`,
    id,
  );
  await audit({
    action: "AI_ERROR",
    entityType: "survey",
    entityId: id,
    after: { message: String(error.message).slice(0, 500) },
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
