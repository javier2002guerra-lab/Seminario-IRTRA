import { NextResponse } from "next/server";
import { get, run, audit, transaction } from "@/lib/db";
import { currentUser, can } from "@/lib/auth";
import { validateFile, saveOriginal } from "@/lib/files";
import { analyzeSurvey, PROMPT_VERSION } from "@/lib/analyzer";
import { assignSla } from "@/lib/sla";
export const runtime = "nodejs";

const windows = new Map();
function limited(id) {
  const now = Date.now(),
    e = windows.get(id) || { n: 0, start: now };
  if (now - e.start > 60000) {
    e.n = 0;
    e.start = now;
  }
  e.n++;
  windows.set(id, e);
  return e.n > 20;
}

export async function POST(req) {
  const user = await currentUser();
  if (!can(user, "verificador"))
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (limited(user.id))
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
  const errors = [];
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const meta = await validateFile(file.name, file.type, buffer);
      if (await get("SELECT id FROM surveys WHERE sha256=?", meta.sha256))
        throw new Error("Documento duplicado.");
      const stored = saveOriginal(buffer, meta.ext);
      const info = await run(
        "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status) VALUES(?,?,?,?,?,?) RETURNING id",
        file.name.slice(0, 255),
        stored,
        meta.mime,
        buffer.length,
        meta.sha256,
        "En procesamiento",
      );
      const id = Number(info.lastInsertRowid);
      await audit({
        userId: user.id,
        action: "DOCUMENT_UPLOAD",
        entityType: "survey",
        entityId: id,
        ip: req.headers.get("x-forwarded-for"),
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
      errors.push(`${file.name}: ${e.message}`);
    }
  }
  return NextResponse.json(
    { created, errors },
    { status: created ? 201 : 400 },
  );
}
