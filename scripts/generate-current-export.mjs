import { query, closeDatabase } from "../lib/db.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const output = path.resolve(process.argv[2] || "INFORME GERENCIAL - DATOS ACTUALES.xlsm");
const surveys = await query(`
  SELECT s.*,COALESCE(string_agg(DISTINCT a.name,'|'),'') areas
  FROM surveys s
  LEFT JOIN survey_areas sa ON sa.survey_id=s.id
  LEFT JOIN areas a ON a.id=sa.area_id
  WHERE s.status<>'Error'
  GROUP BY s.id ORDER BY s.created_at
`);
const ratings = await query(`
  SELECT sr.survey_id,sr.service_name,sr.rating,sr.score,sr.negative
  FROM service_ratings sr JOIN surveys s ON s.id=sr.survey_id
  WHERE s.status<>'Error' ORDER BY sr.id
`);
const bySurvey = new Map();
for (const rating of ratings) {
  const key = String(rating.survey_id);
  if (!bySurvey.has(key)) bySurvey.set(key, []);
  bySurvey.get(key).push(rating);
}
const payload = surveys.map((row) => {
  let extracted = {};
  try { extracted = JSON.parse(row.extracted_data || "{}"); } catch {}
  return {
    id: row.id, created_at: row.created_at, category: row.category,
    priority: row.priority, primary_topic: row.primary_topic, summary: row.summary,
    origin_place: row.origin_place, restaurant: row.restaurant, hotel: row.hotel,
    general: extracted.general_data || {}, numbered: extracted.numbered_answers || {},
    areas: row.areas ? row.areas.split("|") : [], ratings: bySurvey.get(String(row.id)) || [],
  };
});
const temporary = path.join(os.tmpdir(), `irtra-audit-${crypto.randomUUID()}.json`);
try {
  fs.writeFileSync(temporary, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  const python = process.env.PYTHON_COMMAND || "python";
  const result = spawnSync(
    python,
    [path.join(root, "scripts", "fill-managerial-template.py"),
      path.join(root, "data", "excel_templates", "INFORME GERENCIAL ENCUESTAS.xlsm"),
      temporary, output],
    { cwd: root, encoding: "utf8", timeout: 180000, windowsHide: true },
  );
  if (result.status !== 0 || !fs.existsSync(output))
    throw new Error(String(result.stderr || result.stdout || "No se generó el archivo.").slice(0, 2000));
  console.log(`EXPORT_OK records=${payload.length} ratings=${ratings.length} output=${output}`);
} finally {
  try { fs.unlinkSync(temporary); } catch {}
  await closeDatabase();
}
