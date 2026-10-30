import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  closeDatabase,
  get,
  query,
  run,
  transaction,
} from "../lib/db.js";
import {
  boundedConcurrency,
  processBoundedQueue,
} from "../lib/bounded-queue.js";

const SERVICES = [
  "Recepción",
  "Habitación",
  "Limpieza",
  "Restaurante",
  "Jardines",
  "Piscinas",
  "Seguridad",
  "Mantenimiento",
  "Eventos",
  "Parqueos",
  "Transporte",
  "Información",
  "Club Corozos",
  "Atención del personal",
];
const RATINGS = ["Excelente", "Bueno", "Regular", "Malo", "Sin dato"];
const SCORES = { Excelente: 4, Bueno: 3, Regular: 2, Malo: 1, "Sin dato": null };
const CATEGORIES = [
  "Queja",
  "Sugerencia",
  "Felicitación",
  "Mixta",
  "Sin observaciones",
];
const PRIORITIES = ["Alto", "Medio", "Bajo", "Informativo"];
const RESTAURANTS = ["La Hacienda", "Arekas", "Corozos", "Kapahapa"];
const HOTELS = ["San Martín", "Santa Cruz", "Ranchería", "Palajunoj"];

function cliNumber(name, fallback, maximum) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number.parseInt(raw || String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function metricSummary(values) {
  return {
    p50_ms: Number(percentile(values, 0.5).toFixed(2)),
    p95_ms: Number(percentile(values, 0.95).toFixed(2)),
    p99_ms: Number(percentile(values, 0.99).toFixed(2)),
    max_ms: Number(Math.max(0, ...values).toFixed(2)),
  };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function createExpected(index, area) {
  const number = index + 1;
  const token = String(number).padStart(4, "0");
  const ambiguous = number % 10 === 0;
  const category = CATEGORIES[index % CATEGORIES.length];
  const priority = PRIORITIES[index % PRIORITIES.length];
  const generalData = {
    document_number: `SIM-${token}`,
    visitor_name: ambiguous ? null : `Persona Sintética ${token}`,
    affiliate_status: number % 2 ? "Afiliado" : "Invitado",
    visit_date: `${String((number % 28) + 1).padStart(2, "0")}/${String((number % 12) + 1).padStart(2, "0")}/2098`,
    email: `sim-${token}@example.invalid`,
    phone: `5555${token}`,
    room_number: String(100 + number),
    visit_reason: `Motivo sintético ${token}`,
    restaurant: RESTAURANTS[index % RESTAURANTS.length],
    hotel: HOTELS[index % HOTELS.length],
    origin_place: `Origen sintético ${token}`,
  };
  const numberedAnswers = Object.fromEntries(
    Array.from({ length: 14 }, (_, answerIndex) => [
      `item_${answerIndex + 1}`,
      ambiguous && answerIndex === 10
        ? null
        : `Respuesta ${token}-${answerIndex + 1}`,
    ]),
  );
  const serviceRatings = SERVICES.map((service, serviceIndex) => {
    const rating = RATINGS[(index + serviceIndex) % RATINGS.length];
    return {
      service,
      rating,
      score: SCORES[rating],
      negative: rating === "Regular" || rating === "Malo",
    };
  });
  const warnings = ambiguous
    ? [`Nombre e ítem 11 ilegibles en encuesta ${token}; no se adivinaron.`]
    : [];
  const negativeComments = serviceRatings.some((rating) => rating.negative)
    ? [`Comentario negativo sintético ${token}`]
    : [];

  return {
    correlation_id: `encuesta-${token}`,
    category,
    priority,
    priority_reason: `Prioridad sintética ${token}`,
    confidence: ambiguous ? 0.72 : 0.97,
    summary: `Resumen sintético ${token}`,
    primary_topic: `Tema ${index % 7}`,
    secondary_topics: [`Subtema ${index % 5}`, `Lote ${index % 4}`],
    general_data: generalData,
    numbered_answers: numberedAnswers,
    negative_comments: negativeComments,
    classification_evidence: [
      { source: "Pregunta 14", text: `Evidencia sintética ${token}` },
    ],
    extraction_warnings: warnings,
    areas: [area.name],
    area_id: Number(area.id),
    service_ratings: serviceRatings,
    ambiguous,
    model: "simulador-determinista-local-v1",
  };
}

async function simulateAnalysis(expected, index) {
  const serialized = JSON.stringify(expected);
  let digest = serialized;
  for (let iteration = 0; iteration < 8; iteration++)
    digest = crypto.createHash("sha256").update(digest).digest("hex");
  await new Promise((resolve) => setTimeout(resolve, 12 + (index % 8) * 4));
  const result = JSON.parse(serialized);
  result.analysis_digest = digest;
  return result;
}

async function persistResult(prefix, index, result) {
  const storedName = `${prefix}-${String(index + 1).padStart(4, "0")}.png`;
  const sha256 = crypto.createHash("sha256").update(storedName).digest("hex");
  return transaction(async () => {
    const extractedData = {
      general_data: result.general_data,
      numbered_answers: result.numbered_answers,
      negative_comments: result.negative_comments,
      service_ratings: result.service_ratings,
      classification_evidence: result.classification_evidence,
      extraction_warnings: result.extraction_warnings,
      correlation_id: result.correlation_id,
    };
    const survey = await run(
      `INSERT INTO surveys(
        original_name,stored_name,mime_type,size,sha256,status,category,priority,
        priority_reason,confidence,summary,primary_topic,secondary_topics,
        extracted_data,ai_original,model,prompt_version,needs_review,
        validation_status,restaurant,hotel,origin_place
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      storedName,
      storedName,
      "image/png",
      2048 + index,
      sha256,
      "Pendiente de revisión",
      result.category,
      result.priority,
      result.priority_reason,
      result.confidence,
      result.summary,
      result.primary_topic,
      JSON.stringify(result.secondary_topics),
      JSON.stringify(extractedData),
      JSON.stringify(result),
      result.model,
      "queue-simulation-1",
      1,
      "Pendiente de revisión",
      result.general_data.restaurant,
      result.general_data.hotel,
      result.general_data.origin_place,
    );
    const surveyId = Number(survey.lastInsertRowid);
    await run(
      "INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?)",
      surveyId,
      result.area_id,
    );
    for (const rating of result.service_ratings)
      await run(
        "INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)",
        surveyId,
        rating.service,
        rating.rating,
        rating.score,
        rating.negative ? 1 : 0,
      );
    return { surveyId, storedName };
  });
}

function normalizedExpected(expected) {
  return {
    correlation_id: expected.correlation_id,
    category: expected.category,
    priority: expected.priority,
    priority_reason: expected.priority_reason,
    confidence: expected.confidence,
    summary: expected.summary,
    primary_topic: expected.primary_topic,
    secondary_topics: expected.secondary_topics,
    general_data: expected.general_data,
    numbered_answers: expected.numbered_answers,
    negative_comments: expected.negative_comments,
    classification_evidence: expected.classification_evidence,
    extraction_warnings: expected.extraction_warnings,
    areas: [...expected.areas].sort(),
    service_ratings: expected.service_ratings,
    status: "Pendiente de revisión",
    validation_status: "Pendiente de revisión",
    needs_review: 1,
  };
}

function compareValues(expected, actual, pathName, mismatches, counter) {
  if (Array.isArray(expected)) {
    counter.total++;
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      mismatches.push({ path: pathName, expected: expected.length, actual: actual?.length });
      counter.failed++;
      return;
    }
    expected.forEach((value, index) =>
      compareValues(value, actual[index], `${pathName}[${index}]`, mismatches, counter),
    );
    return;
  }
  if (expected && typeof expected === "object") {
    for (const key of Object.keys(expected))
      compareValues(expected[key], actual?.[key], `${pathName}.${key}`, mismatches, counter);
    return;
  }
  counter.total++;
  if (!Object.is(expected, actual)) {
    counter.failed++;
    mismatches.push({ path: pathName, expected, actual });
  }
}

async function verifyPersistence(prefix, jobs) {
  const rows = await query(
    `SELECT s.*,
       COALESCE(array_agg(a.name ORDER BY a.name)
         FILTER (WHERE a.name IS NOT NULL),'{}') areas
     FROM surveys s
     LEFT JOIN survey_areas sa ON sa.survey_id=s.id
     LEFT JOIN areas a ON a.id=sa.area_id
     WHERE s.stored_name LIKE ?
     GROUP BY s.id
     ORDER BY s.stored_name`,
    `${prefix}-%`,
  );
  const ratings = await query(
    `SELECT s.stored_name,sr.service_name,sr.rating,sr.score,sr.negative
     FROM service_ratings sr
     JOIN surveys s ON s.id=sr.survey_id
     WHERE s.stored_name LIKE ?
     ORDER BY s.stored_name,sr.id`,
    `${prefix}-%`,
  );
  const ratingsByName = new Map();
  for (const rating of ratings) {
    if (!ratingsByName.has(rating.stored_name))
      ratingsByName.set(rating.stored_name, []);
    ratingsByName.get(rating.stored_name).push({
      service: rating.service_name,
      rating: rating.rating,
      score: rating.score === null ? null : Number(rating.score),
      negative: Number(rating.negative) === 1,
    });
  }
  const expectedByName = new Map(
    jobs.map((job, index) => [
      `${prefix}-${String(index + 1).padStart(4, "0")}.png`,
      job.expected,
    ]),
  );
  const counter = { total: 0, failed: 0 };
  const mismatches = [];
  let exactSurveys = 0;
  for (const row of rows) {
    const expected = expectedByName.get(row.stored_name);
    if (!expected) {
      mismatches.push({ path: row.stored_name, expected: "encuesta conocida", actual: "inesperada" });
      continue;
    }
    const extracted = parseJson(row.extracted_data, {});
    const actual = {
      correlation_id: extracted.correlation_id,
      category: row.category,
      priority: row.priority,
      priority_reason: row.priority_reason,
      confidence: Number(row.confidence),
      summary: row.summary,
      primary_topic: row.primary_topic,
      secondary_topics: parseJson(row.secondary_topics, []),
      general_data: extracted.general_data,
      numbered_answers: extracted.numbered_answers,
      negative_comments: extracted.negative_comments,
      classification_evidence: extracted.classification_evidence,
      extraction_warnings: extracted.extraction_warnings,
      areas: row.areas,
      service_ratings: ratingsByName.get(row.stored_name) || [],
      status: row.status,
      validation_status: row.validation_status,
      needs_review: Number(row.needs_review),
    };
    const before = mismatches.length;
    compareValues(
      normalizedExpected(expected),
      actual,
      expected.correlation_id,
      mismatches,
      counter,
    );
    if (mismatches.length === before) exactSurveys++;
  }
  const uniqueness = await get(
    `SELECT count(*)::int total,
       count(DISTINCT stored_name)::int unique_names,
       count(DISTINCT sha256)::int unique_hashes
     FROM surveys WHERE stored_name LIKE ?`,
    `${prefix}-%`,
  );
  return {
    rows: rows.length,
    ratings: ratings.length,
    exactSurveys,
    comparisons: counter.total,
    failedComparisons: counter.failed,
    mismatches: mismatches.slice(0, 10),
    duplicates:
      Number(uniqueness.total) -
      Math.min(Number(uniqueness.unique_names), Number(uniqueness.unique_hashes)),
  };
}

async function cleanup(prefix) {
  return transaction(async () => {
    await run(
      "DELETE FROM service_ratings WHERE survey_id IN (SELECT id FROM surveys WHERE stored_name LIKE ?)",
      `${prefix}-%`,
    );
    await run(
      "DELETE FROM survey_areas WHERE survey_id IN (SELECT id FROM surveys WHERE stored_name LIKE ?)",
      `${prefix}-%`,
    );
    const removed = await run(
      "DELETE FROM surveys WHERE stored_name LIKE ?",
      `${prefix}-%`,
    );
    return removed.rowCount;
  });
}

const count = cliNumber("count", 100, 1000);
const concurrency = boundedConcurrency(cliNumber("concurrency", 8, 8));
const runId = crypto.randomUUID();
const prefix = `queue-sim-${runId}`;
const evidencePath = path.resolve(
  "auditoria",
  "evidencias",
  "COLA_100_RESULTADO.json",
);
const startedAt = new Date();
const cpuStart = process.cpuUsage();
const rssStart = process.memoryUsage().rss;
let peakRss = rssStart;
const memorySampler = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 5);
memorySampler.unref();
let report;
let cleanupResult = { removed: 0, remaining: null };
let fatalError = null;

try {
  const area = await get(
    "SELECT id,name FROM areas WHERE active=1 ORDER BY CASE WHEN name='Sin especificar' THEN 0 ELSE 1 END,name LIMIT 1",
  );
  if (!area) throw new Error("No existe un área activa para la simulación.");
  const jobs = Array.from({ length: count }, (_, index) => ({
    index,
    expected: createExpected(index, area),
  }));
  const enqueuedAt = performance.now();
  const queueWaits = [];
  const analysisTimes = [];
  const persistenceTimes = [];
  const totalTimes = [];
  const failures = [];
  let active = 0;
  let maximumActive = 0;

  const queueStart = performance.now();
  await processBoundedQueue(
    jobs,
    async (job) => {
      const jobStart = performance.now();
      queueWaits.push(jobStart - enqueuedAt);
      active++;
      maximumActive = Math.max(maximumActive, active);
      try {
        const analysisStart = performance.now();
        const result = await simulateAnalysis(job.expected, job.index);
        analysisTimes.push(performance.now() - analysisStart);
        const persistenceStart = performance.now();
        await persistResult(prefix, job.index, result);
        persistenceTimes.push(performance.now() - persistenceStart);
        totalTimes.push(performance.now() - jobStart);
      } catch (error) {
        failures.push({
          correlation_id: job.expected.correlation_id,
          message: String(error?.message || error).slice(0, 300),
        });
      } finally {
        active--;
      }
    },
    concurrency,
  );
  const queueDuration = performance.now() - queueStart;
  const verification = await verifyPersistence(prefix, jobs);
  const cpu = process.cpuUsage(cpuStart);
  const passed =
    failures.length === 0 &&
    verification.rows === count &&
    verification.exactSurveys === count &&
    verification.failedComparisons === 0 &&
    verification.duplicates === 0 &&
    maximumActive <= concurrency;

  report = {
    test: "Simulación local de 100 encuestas en cola",
    executed_at: startedAt.toISOString(),
    result: passed ? "APROBADA" : "FALLIDA",
    scope: {
      queued_surveys: count,
      concurrency,
      external_services_used: false,
      analyzer: "doble determinista local con datos sintéticos y verdad conocida",
      database: "PostgreSQL local; filas de prueba eliminadas al finalizar",
      ambiguous_surveys: jobs.filter((job) => job.expected.ambiguous).length,
      ratings_persisted: count * SERVICES.length,
    },
    queue: {
      duration_ms: Number(queueDuration.toFixed(2)),
      throughput_surveys_per_second: Number((count / (queueDuration / 1000)).toFixed(2)),
      maximum_active_observed: maximumActive,
      queue_wait: metricSummary(queueWaits),
      analysis: metricSummary(analysisTimes),
      persistence: metricSummary(persistenceTimes),
      end_to_end_per_survey: metricSummary(totalTimes),
      failures: failures.length,
      retries: 0,
    },
    data_quality: {
      exact_surveys: verification.exactSurveys,
      survey_accuracy_percent: Number(((verification.exactSurveys / count) * 100).toFixed(2)),
      field_comparisons: verification.comparisons,
      failed_field_comparisons: verification.failedComparisons,
      field_accuracy_percent: Number(
        (((verification.comparisons - verification.failedComparisons) /
          Math.max(1, verification.comparisons)) *
          100).toFixed(4),
      ),
      persisted_surveys: verification.rows,
      persisted_ratings: verification.ratings,
      duplicate_identifiers: verification.duplicates,
      mismatches: verification.mismatches,
    },
    resources: {
      cpu_user_ms: Number((cpu.user / 1000).toFixed(2)),
      cpu_system_ms: Number((cpu.system / 1000).toFixed(2)),
      rss_start_mb: Number((rssStart / 1024 / 1024).toFixed(2)),
      rss_peak_mb: Number((peakRss / 1024 / 1024).toFixed(2)),
    },
    limitations: [
      "La prueba demuestra concurrencia, aislamiento, persistencia e integridad con resultados sintéticos conocidos.",
      "No mide precisión real de lectura de imágenes, manuscritos u OCR/IA; no se enviaron datos a OpenAI.",
      "No sustituye una prueba en staging con 100 escaneos anonimizados y etiquetados por revisores humanos.",
    ],
  };
} catch (error) {
  fatalError = error;
  report = {
    test: "Simulación local de 100 encuestas en cola",
    executed_at: startedAt.toISOString(),
    result: "FALLIDA",
    error: String(error?.message || error).slice(0, 500),
  };
} finally {
  clearInterval(memorySampler);
  try {
    cleanupResult.removed = await cleanup(prefix);
    cleanupResult.remaining = Number(
      (
        await get(
          "SELECT count(*)::int count FROM surveys WHERE stored_name LIKE ?",
          `${prefix}-%`,
        )
      )?.count || 0,
    );
  } catch (cleanupError) {
    cleanupResult.error = String(cleanupError?.message || cleanupError).slice(0, 300);
    report.result = "FALLIDA";
  }
  report.cleanup = cleanupResult;
  report.finished_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await closeDatabase();
}

console.log(JSON.stringify(report, null, 2));
if (fatalError || report.result !== "APROBADA" || cleanupResult.remaining !== 0)
  process.exitCode = 1;
