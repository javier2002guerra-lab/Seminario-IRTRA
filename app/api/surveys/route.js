import { NextResponse } from "next/server";
import { get, run, audit, transaction } from "@/lib/db";
import { currentUser, can } from "@/lib/auth";
import { validateFile, saveOriginal, removeOriginal } from "@/lib/files";
import { analyzeSurvey, INVALID_SURVEY_MESSAGE, InvalidSurveyError, PROMPT_VERSION } from "@/lib/analyzer";
import { assignSla } from "@/lib/sla";
import { clientIp } from "@/lib/security";
export const runtime = "nodejs";

import { consumeRateLimit } from "@/lib/db";
import { scopedSurvey } from "@/lib/scope";

export async function POST(req) {
  const user = await currentUser();
  if (!can(user, "verificador"))
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (await consumeRateLimit(`upload:user:${user.id}`, 20, 60))
    return NextResponse.json(
      { error: "Límite de cargas alcanzado. Intente en un minuto." },
      { status: 429 },
    );
  const files = (await req.formData()).getAll("files");
  if (!files.length)
    return NextResponse.json(
      { error: "No se recibieron archivos." },
      { status: 400 },
    );
  let created = 0;
  let invalidRejected = false;
  const errors = [];
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const meta = await validateFile(file.name, file.type, buffer);
      const duplicate = await get("SELECT id FROM surveys WHERE sha256=?", meta.sha256);
      if (duplicate) {
        if (await scopedSurvey(user, duplicate.id)) {
          await run(
            "INSERT INTO survey_files(survey_id,content) VALUES(?,?) ON CONFLICT(survey_id) DO UPDATE SET content=EXCLUDED.content",
            duplicate.id,
            buffer,
          );
          errors.push(`${file.name}: el original existente fue restaurado.`);
        } else errors.push(`${file.name}: documento duplicado.`);
        continue;
      }
      const stored = saveOriginal(buffer, meta.ext);
      const info = await run(
        "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,created_by) VALUES(?,?,?,?,?,?,?) RETURNING id",
        file.name.slice(0, 255),
        stored,
        meta.mime,
        buffer.length,
        meta.sha256,
        "En procesamiento",
        user.id,
      );
      const id = Number(info.lastInsertRowid);
      await run("INSERT INTO survey_files(survey_id,content) VALUES(?,?)", id, buffer);
      await audit({
        userId: user.id,
        action: "DOCUMENT_UPLOAD",
        entityType: "survey",
        entityId: id,
        ip: clientIp(req),
        after: { name: file.name, size: buffer.length, sha256: meta.sha256 },
      });
      try {
        const a = await analyzeSurvey(stored, meta.mime);
        await transaction(async () => {
          await run(
            "UPDATE surveys SET status=?,category=?,priority=?,priority_reason=?,confidence=?,summary=?,primary_topic=?,secondary_topics=?,extracted_data=?,ai_original=?,model=?,prompt_version=?,needs_review=1,validation_status='Pendiente de revisión',restaurant=?,hotel=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            "Pendiente de revisión",
            a.category,
            a.priority,
            a.priority_reason,
            a.confidence,
            a.summary,
            a.primary_topic,
            JSON.stringify(a.secondary_topics),
            JSON.stringify({
              ...a.extracted_data,
              general_data: a.general_data,
              numbered_answers: a.numbered_answers,
              negative_comments: a.negative_comments,
              classification_evidence: a.classification_evidence,
              extraction_warnings: a.extraction_warnings,
            }),
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
              String(s.service).slice(0, 160),
              s.rating,
              s.score,
              s.negative ? 1 : 0,
            );
          await audit({
            userId: user.id,
            action: "AI_ANALYSIS",
            entityType: "survey",
            entityId: id,
            after: { model: a.model, prompt: PROMPT_VERSION, category: a.category, priority: a.priority, confidence: a.confidence, needs_review: true },
          });
        });
        await assignSla(id);
      } catch (err) {
        if (err instanceof InvalidSurveyError) {
          await run("DELETE FROM surveys WHERE id=?", id);
          removeOriginal(stored);
          await audit({
            userId: user.id,
            action: "INVALID_DOCUMENT_REJECTED",
            ip: clientIp(req),
            after: { name: file.name, reason: err.reason },
          });
          throw err;
        }
        await run(
          "UPDATE surveys SET status=?,needs_review=1,summary=? WHERE id=?",
          "Error",
          "Error de análisis: revisión requerida.",
          id,
        );
        await audit({
          userId: user.id,
          action: "AI_ERROR",
          entityType: "survey",
          entityId: id,
          after: { message: String(err.message).slice(0, 300) },
        });
      }
      created++;
    } catch (e) {
      if (e instanceof InvalidSurveyError) invalidRejected = true;
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  return NextResponse.json(
    {
      created,
      errors,
      ...(created === 0
        ? { error: invalidRejected ? INVALID_SURVEY_MESSAGE : errors[0] || "No se pudo procesar el documento." }
        : {}),
    },
    { status: created ? 201 : 400 },
  );
}
