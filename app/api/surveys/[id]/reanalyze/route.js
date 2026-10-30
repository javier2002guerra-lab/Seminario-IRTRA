import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import { analyzeSurvey, PROMPT_VERSION } from "@/lib/analyzer";
import { get, run, audit, transaction } from "@/lib/db";
import { scopedSurvey } from "@/lib/scope";
import { notifySurveyChange } from "@/lib/live";
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!can(user, "verificador")) return NextResponse.json({ error: "Sin permiso para volver a analizar." }, { status: 403 });
  const { id } = await params, record = await scopedSurvey(user, id);
  if (!record) return NextResponse.json({ error: "Encuesta no encontrada." }, { status: 404 });
  const body = await req.json(), reason = String(body.reason || "").trim();
  if (reason.length < 5) return NextResponse.json({ error: "Indique un motivo de al menos 5 caracteres." }, { status: 400 });
  await run("UPDATE surveys SET status='En procesamiento',updated_at=CURRENT_TIMESTAMP WHERE id=?", record.id);
  try {
    const result = await analyzeSurvey(record.stored_name, record.mime_type);
    const extracted = { ...result.extracted_data, general_data: result.general_data, numbered_answers: result.numbered_answers, negative_comments: result.negative_comments, classification_evidence: result.classification_evidence, extraction_warnings: result.extraction_warnings };
    await transaction(async () => {
      await run("DELETE FROM survey_areas WHERE survey_id=?", record.id);
      await run("DELETE FROM service_ratings WHERE survey_id=?", record.id);
      await run("UPDATE surveys SET status='Pendiente de revisión',category=?,priority=?,priority_reason=?,confidence=?,summary=?,primary_topic=?,secondary_topics=?,extracted_data=?,ai_original=?,model=?,prompt_version=?,needs_review=1,validation_status='Pendiente de revisión',restaurant=?,hotel=?,confirmed_by=NULL,confirmed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", result.category, result.priority, result.priority_reason, result.confidence, result.summary, result.primary_topic, JSON.stringify(result.secondary_topics), JSON.stringify(extracted), JSON.stringify(result), result.model, PROMPT_VERSION, result.general_data?.restaurant || null, result.general_data?.hotel || null, record.id);
      for (const name of result.areas || []) {
        const area = await get("SELECT id FROM areas WHERE name=? AND active=1", name);
        if (area) await run("INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?) ON CONFLICT DO NOTHING", record.id, area.id);
      }
      for (const rating of result.service_ratings || []) await run("INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)", record.id, String(rating.service).slice(0, 160), rating.rating, rating.score, rating.negative ? 1 : 0);
      await audit({ userId: user.id, action: "AUTOMATIC_REPROCESS", entityType: "survey", entityId: record.id, before: { confidence: record.confidence, category: record.category, priority: record.priority }, after: { confidence: result.confidence, category: result.category, priority: result.priority, reason } });
    });
    await notifySurveyChange("survey.reanalyzed", { entityId: record.id });
    return NextResponse.json({ ok: true, confidence: result.confidence });
  } catch (error) {
    await run("UPDATE surveys SET status='Pendiente de revisión',updated_at=CURRENT_TIMESTAMP WHERE id=?", record.id);
    await audit({ userId: user.id, action: "AUTOMATIC_REPROCESS_ERROR", entityType: "survey", entityId: record.id, after: { message: String(error.message).slice(0, 300), reason } });
    await notifySurveyChange("survey.updated", { entityId: record.id });
    return NextResponse.json({ error: "No fue posible completar el análisis. Los datos anteriores se conservaron." }, { status: 502 });
  }
}
