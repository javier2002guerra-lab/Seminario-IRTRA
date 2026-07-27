import path from "node:path";
import { get, run, audit, transaction } from "./db.js";
import { validateFile, saveOriginal } from "./files.js";
import { analyzeSurvey, PROMPT_VERSION } from "./analyzer.js";
import { assignSla } from "./sla.js";

export async function ingestSurvey({ name, type, buffer, userId = null, source = "manual", ip = null }) {
  const meta = await validateFile(name, type, buffer);
  if (await get("SELECT id FROM surveys WHERE sha256=?", meta.sha256))
    throw new Error("Documento duplicado.");
  const stored = saveOriginal(buffer, meta.ext);
  const info = await run(
    "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status) VALUES(?,?,?,?,?,?) RETURNING id",
    path.basename(name).slice(0, 255), stored, meta.mime, buffer.length, meta.sha256, "En procesamiento",
  );
  const id = Number(info.lastInsertRowid);
  await audit({ userId, action: source === "scanner" ? "SCANNER_IMPORT" : "DOCUMENT_UPLOAD", entityType: "survey", entityId: id, ip, after: { name: path.basename(name), size: buffer.length, sha256: meta.sha256, source } });
  try {
    const a = await analyzeSurvey(stored, meta.mime);
    await transaction(async () => {
      await run(
        "UPDATE surveys SET status=?,category=?,priority=?,priority_reason=?,confidence=?,summary=?,primary_topic=?,secondary_topics=?,extracted_data=?,ai_original=?,model=?,prompt_version=?,needs_review=1,validation_status='Pendiente de revisión',restaurant=?,hotel=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        "Pendiente de revisión", a.category, a.priority, a.priority_reason, a.confidence, a.summary, a.primary_topic,
        JSON.stringify(a.secondary_topics),
        JSON.stringify({ ...a.extracted_data, general_data: a.general_data, numbered_answers: a.numbered_answers, negative_comments: a.negative_comments, classification_evidence: a.classification_evidence, extraction_warnings: a.extraction_warnings }),
        JSON.stringify(a), a.model, PROMPT_VERSION, a.general_data?.restaurant || null, a.general_data?.hotel || null, id,
      );
      for (const areaName of a.areas || []) {
        const area = await get("SELECT id FROM areas WHERE name=? AND active=1", areaName);
        if (area) await run("INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?) ON CONFLICT DO NOTHING", id, area.id);
      }
      for (const rating of a.service_ratings || [])
        await run("INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)", id, String(rating.service).slice(0, 160), rating.rating, rating.score, rating.negative ? 1 : 0);
      await audit({ userId, action: "AI_ANALYSIS", entityType: "survey", entityId: id, after: { model: a.model, prompt: PROMPT_VERSION, category: a.category, priority: a.priority, confidence: a.confidence, source } });
    });
    await assignSla(id);
  } catch (error) {
    await run("UPDATE surveys SET status='Error',needs_review=1,summary=? WHERE id=?", `Error de análisis: ${String(error.message).slice(0, 300)}`, id);
    await audit({ userId, action: "AI_ERROR", entityType: "survey", entityId: id, after: { message: String(error.message).slice(0, 300), source } });
  }
  return { id, stored, meta };
}
