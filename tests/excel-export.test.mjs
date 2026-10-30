import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  managerialExportRow,
  managerialExportRows,
} from "../lib/managerial-export.js";
import { closeDatabase, get, run, transaction } from "../lib/db.js";

const root = process.cwd();
const python = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
const pythonEnv = {
  ...process.env,
  PYTHONPATH: [path.join(root, ".python-packages"), process.env.PYTHONPATH]
    .filter(Boolean)
    .join(path.delimiter),
};

after(() => closeDatabase());

function runPython(args) {
  const result = spawnSync(python, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true,
    env: pythonEnv,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result;
}

test("no convierte respuestas ausentes en Sí y conserva semántica de fechas y servicios", () => {
  runPython([path.join(root, "tests", "excel-edge-cases.py")]);
});

test("verifica todos los meses, catorce servicios, calificaciones, restaurantes y hoteles", () => {
  const result = runPython([path.join(root, "tests", "verify-excel-matrix.py")]);
  assert.equal(JSON.parse(result.stdout).passed, true);
});

test("normaliza la fila exportable sin perder datos extraídos", () => {
  const row = managerialExportRow({
    id: 9,
    created_at: "2026-01-01T10:00:00Z",
    category: "Queja",
    priority: "Alto",
    primary_topic: "Servicio",
    secondary_topics: '["Limpieza"]',
    summary: "Resumen",
    origin_place: null,
    restaurant: null,
    hotel: null,
    areas: "Habitaciones|Seguridad",
    extracted_data: JSON.stringify({
      general_data: { restaurant: "AREKAS", hotel: "SAN MARTIN", origin_place: "Spa" },
      numbered_answers: { item_7: "Sí" },
      negative_comments: ["Comentario"],
    }),
  }, [{ service_name: "Jardines", rating: "Bueno" }]);
  assert.equal(row.restaurant, "AREKAS");
  assert.equal(row.hotel, "SAN MARTIN");
  assert.equal(row.origin_place, "Spa");
  assert.deepEqual(row.areas, ["Habitaciones", "Seguridad"]);
  assert.deepEqual(row.secondary_topics, ["Limpieza"]);
  assert.deepEqual(row.negative_comments, ["Comentario"]);
  assert.equal(row.ratings.length, 1);
});

test("lee de PostgreSQL solo encuestas confirmadas y conserva extracción y calificaciones", async () => {
  const rollback = new Error("ROLLBACK_EXCEL_FIXTURE");
  await assert.rejects(
    transaction(async () => {
      const token = crypto.randomUUID();
      const area = await run(
        "INSERT INTO areas(name,description,active) VALUES(?,?,1) ON CONFLICT(name) DO UPDATE SET active=1 RETURNING id",
        `Excel QA ${token}`,
        "Área temporal de prueba",
      );
      const extracted = {
        general_data: { visit_date: "15/04/2099", restaurant: "AREKAS" },
        numbered_answers: { item_7: "Sí" },
        negative_comments: ["Prueba controlada"],
      };
      const survey = await run(
        "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,priority,primary_topic,secondary_topics,extracted_data,validation_status,restaurant,created_at) VALUES(?,?,?,?,?,'Confirmada','Queja','Medio','Servicio','[]',?,'Confirmada','AREKAS',?::timestamptz) RETURNING id",
        "excel-qa.png",
        `excel-qa-${token}.png`,
        "image/png",
        100,
        crypto.createHash("sha256").update(token).digest("hex"),
        JSON.stringify(extracted),
        "2099-04-15T10:00:00Z",
      );
      await run(
        "INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?)",
        survey.lastInsertRowid,
        area.lastInsertRowid,
      );
      await run(
        "INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)",
        survey.lastInsertRowid,
        "Calidad de comida",
        "Bueno",
        4,
        0,
      );
      await run(
        "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,priority,primary_topic,secondary_topics,extracted_data,validation_status,created_at) VALUES(?,?,?,?,?,'Pendiente de revisión','Sin observaciones','Informativo','Pendiente','[]','{}','Pendiente de revisión',?::timestamptz)",
        "excel-pending.png",
        `excel-pending-${token}.png`,
        "image/png",
        100,
        crypto.createHash("sha256").update(`${token}-pending`).digest("hex"),
        "2099-04-16T10:00:00Z",
      );
      const rows = await managerialExportRows({
        range: { from: "2099-04-01", to: "2099-04-30" },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, survey.lastInsertRowid);
      assert.equal(rows[0].restaurant, "AREKAS");
      assert.equal(rows[0].general.visit_date, "15/04/2099");
      assert.deepEqual(rows[0].negative_comments, ["Prueba controlada"]);
      assert.equal(rows[0].ratings[0].rating, "Bueno");
      assert.equal((await get("SELECT count(*)::int total FROM surveys WHERE validation_status<>'Confirmada' AND created_at>=?::date AND created_at<?::date + INTERVAL '1 day'", "2099-04-01", "2099-04-30")).total, 1);
      throw rollback;
    }),
    (error) => error === rollback,
  );
});

test("genera XLSM íntegro y coloca exactamente los datos de las encuestas", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "irtra-excel-test-"));
  const input = path.join(temporary, "input.json");
  const output = path.join(temporary, "output.xlsm");
  const template = path.join(root, "data", "excel_templates", "INFORME GERENCIAL ENCUESTAS.xlsm");
  const templateHash = crypto.createHash("sha256").update(fs.readFileSync(template)).digest("hex");
  const rows = [
    {
      id: 1, created_at: "2026-01-20T10:00:00Z", category: "Mixta", primary_topic: "=RIESGO",
      origin_place: "Golfito", restaurant: "LA HACIENDA", hotel: "SAN MARTIN",
      areas: ["Restaurantes"], negative_comments: ["Comida fría"],
      general: { visit_date: "15/01/2026", affiliate_status: "Sí", visit_reason: "Huésped, restaurante y evento" },
      numbered: { item_7: "Sí", item_10: "No", item_11: "Sí", item_12: "Mesero y cajero" },
      ratings: [
        { service_name: "Cortesía del personal", rating: "Excelente" },
        { service_name: "Calidad de comida", rating: "Bueno" },
        { service_name: "Servicio en Restaurante", rating: "Regular" },
        { service_name: "Servicio Club Los Corozos (spa, gimnasio, boliche, golfito)", rating: "Malo" },
      ],
    },
    {
      id: 2, created_at: "2026-02-03T10:00:00Z", category: "Sugerencia", primary_topic: "Más sombra",
      origin_place: "Spa", areas: ["Recepción"], negative_comments: [],
      general: { visit_date: "02-02-26", affiliate_status: "No afiliado", visit_reason: "Club Los Corozos" },
      numbered: { item_7: "No", item_10: null, item_11: "No", item_12: "Recepcionista" },
      ratings: [{ service_name: "Servicio Club Los Corozos (spa)", rating: "Excelente" }],
    },
    {
      id: 3, created_at: "2026-03-03T10:00:00Z", category: "Queja", primary_topic: "Conectividad",
      areas: ["Tecnología"], negative_comments: [], general: { visit_date: "ilegible" }, numbered: {},
      ratings: [{ service_name: "Servicio de personal de eventos", rating: "Regular" }],
    },
  ];
  fs.writeFileSync(input, JSON.stringify(rows), { mode: 0o600 });
  try {
    runPython([path.join(root, "scripts", "fill-managerial-template.py"), template, input, output]);
    const verified = runPython([path.join(root, "tests", "verify-excel-output.py"), "managerial", output, template]);
    assert.equal(JSON.parse(verified.stdout).macros_preserved, true);
    fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
    fs.copyFileSync(output, path.join(root, ".qa", "verified-managerial.xlsm"));
    fs.writeFileSync(path.join(root, "auditoria", "evidencias", "EXCEL_RESULTADO.json"), verified.stdout);
    runPython([path.join(root, "scripts", "verify-xlsm-buttons.py"), output]);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(template)).digest("hex"), templateHash);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("genera XLSX estadístico válido con fechas, porcentajes y texto seguro", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "irtra-stat-test-"));
  const input = path.join(temporary, "input.json");
  const output = path.join(temporary, "output.xlsx");
  const data = {
    range: { from: "2026-01-01", to: "2026-01-31" },
    summary: { total: 3, compliments: 1, complaints: 2, suggestions: 1, pending_review: 0, resolved: 1 },
    categories: [{ label: "=RIESGO", value: 2 }], priorities: [], statuses: [], areas: [], venues: [], daily: [], services: [],
    cases: [{ id: 1, original_name: "encuesta.png", created_at: "2026-01-15T14:30:00Z", category: "Queja", priority: "Alto", status: "Confirmada", confidence: 0.95, origin_place: "Spa" }],
  };
  fs.writeFileSync(input, JSON.stringify(data), { mode: 0o600 });
  try {
    runPython([path.join(root, "scripts", "export-statistical-report.py"), input, output]);
    runPython([path.join(root, "tests", "verify-excel-output.py"), "statistical", output]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
