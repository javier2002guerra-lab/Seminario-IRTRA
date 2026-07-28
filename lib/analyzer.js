import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { get, query } from "./db.js";
import { uploadDirectory } from "./files.js";
import { requiresReview } from "./policy.js";

export const PROMPT_VERSION = "3.2.0";
export const INVALID_SURVEY_MESSAGE =
  "Imagen no válida: no contiene información de encuestas.";

export class InvalidSurveyError extends Error {
  constructor(reason = "") {
    super(INVALID_SURVEY_MESSAGE);
    this.name = "InvalidSurveyError";
    this.reason = String(reason || "").slice(0, 300);
  }
}
export function parseModelOutput(text) {
  const parsed = JSON.parse(text);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.category ||
    !parsed.priority
  )
    throw new Error("Respuesta inválida del modelo.");
  return parsed;
}
const baseResult = {
  category: "Sin observaciones",
  priority: "Informativo",
  priority_reason: "Análisis pendiente de configuración OpenAI.",
  confidence: 0,
  summary: "Documento recibido; requiere revisión humana.",
  primary_topic: "Sin determinar",
  secondary_topics: [],
  areas: ["Sin especificar"],
  negative_comments: [],
  numbered_answers: {},
  general_data: {},
  service_ratings: [],
  classification_evidence: [],
  extraction_warnings: ["OpenAI no está configurado; no se extrajo información."],
  extracted_data: {},
  needs_review: true,
  model: "sin-configurar",
};

export async function analyzeSurvey(stored, mime) {
  if (!process.env.OPENAI_API_KEY) return { ...baseResult };
  const areas = (await query("SELECT name FROM areas WHERE active=1")).map(
    (x) => x.name,
  );
  const threshold = Number(
    (
      await get(
        "SELECT value FROM app_settings WHERE key='confidence_threshold'",
      )
    )?.value || 0.85,
  );
  const bytes = fs.readFileSync(
    path.join(uploadDirectory(), path.basename(stored)),
  );
  const data = `data:${mime};base64,${bytes.toString("base64")}`;
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
    maxRetries: 2,
  });
  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "is_survey",
      "survey_validation_reason",
      "category",
      "priority",
      "priority_reason",
      "confidence",
      "summary",
      "primary_topic",
      "secondary_topics",
      "areas",
      "negative_comments",
      "numbered_answers",
      "general_data",
      "service_ratings",
      "classification_evidence",
      "extraction_warnings",
    ],
    properties: {
      is_survey: { type: "boolean" },
      survey_validation_reason: { type: "string" },
      category: {
        type: "string",
        enum: [
          "Queja",
          "Sugerencia",
          "Felicitación",
          "Mixta",
          "Sin observaciones",
        ],
      },
      priority: {
        type: "string",
        enum: ["Crítico", "Alto", "Medio", "Bajo", "Informativo"],
      },
      priority_reason: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string" },
      primary_topic: { type: "string" },
      secondary_topics: { type: "array", items: { type: "string" } },
      areas: { type: "array", items: { type: "string", enum: areas } },
      negative_comments: { type: "array", items: { type: "string" } },
      numbered_answers: {
        type: "object",
        additionalProperties: false,
        required: Array.from({ length: 14 }, (_, i) => `item_${i + 1}`),
        properties: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`item_${i + 1}`, { type: ["string", "null"] }])),
      },
      general_data: {
        type: "object",
        additionalProperties: false,
        required: ["document_number","visitor_name","affiliate_status","visit_date","email","phone","room_number","visit_reason","restaurant","hotel"],
        properties: {
          document_number: { type: ["string", "null"] },
          visitor_name: { type: ["string", "null"] },
          affiliate_status: { type: ["string", "null"] },
          visit_date: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          room_number: { type: ["string", "null"] },
          visit_reason: { type: ["string", "null"] },
          restaurant: { type: ["string", "null"], enum: ["La Hacienda", "Arekas", "Corozos", "Kapahapa", null] },
          hotel: { type: ["string", "null"], enum: ["San Martín", "Santa Cruz", "Ranchería", "Palajunoj", null] },
        },
      },
      service_ratings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["service", "rating", "score", "negative"],
          properties: {
            service: { type: "string" },
            rating: {
              type: "string",
              enum: ["Excelente", "Bueno", "Regular", "Malo", "Sin dato"],
            },
            score: { type: ["number", "null"] },
            negative: { type: "boolean" },
          },
        },
      },
      classification_evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["source", "text"],
          properties: {
            source: { type: "string", enum: ["Pregunta 8", "Pregunta 9", "Pregunta 10", "Pregunta 11", "Pregunta 14", "Calificación", "Comentario visible"] },
            text: { type: "string" },
          },
        },
      },
      extraction_warnings: { type: "array", items: { type: "string" } },
    },
  };
  const content =
    mime === "application/pdf"
      ? [
          { type: "input_file", filename: stored, file_data: data },
          { type: "input_text", text: "Analiza íntegramente esta encuesta." },
        ]
      : [
          { type: "input_image", image_url: data, detail: "high" },
          {
            type: "input_text",
            text: "Lee texto impreso, manuscrito y todos los números. Amplía mentalmente cada zona antes de transcribir y analiza íntegramente esta encuesta.",
          },
        ];
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5",
    store: false,
    input: [
      {
        role: "system",
        content: `Eres analista de calidad de IRTRA y tu regla principal es la fidelidad documental. Primero valida el tipo de documento. is_survey solo puede ser true cuando la imagen o PDF muestra claramente una encuesta de servicio compatible con las boletas procesadas por este sistema: debe tener estructura de formulario y evidencia visible como preguntas numeradas, opciones de calificación, datos del visitante, número de boleta o comentarios de servicio. Logotipos, fotografías, capturas de pantalla, facturas, identificaciones, cartas, páginas en blanco y documentos de otro tipo son inválidos aunque contengan texto. No infieras que es encuesta por el nombre del archivo. Explica brevemente la evidencia en survey_validation_reason. Si no es una encuesta, usa is_survey=false, no inventes contenido y deja los campos sin evidencia vacíos, null o "Sin dato".

Cuando is_survey=true, extrae únicamente información visible. Nunca completes, deduzcas ni inventes nombres, número de boleta, fechas, respuestas, lugares o calificaciones. Si un campo está vacío, tapado, ambiguo o ilegible devuelve null (o "Sin dato" en calificaciones) y anótalo en extraction_warnings.

Transcribe literalmente el número de boleta y las respuestas 1 a 14. Verifica cada carácter dos veces. Distingue especialmente 0/O, 1/I/l, 2/Z, 5/S, 6/G, 8/B y separadores de fecha, teléfono y decimales. Conserva ceros iniciales. No confundas números impresos del formulario, páginas, fechas o teléfonos con el número de boleta. Comprueba que cada X pertenece a la fila y columna correctas. Si dos lecturas son plausibles, devuelve null y describe ambas posibilidades en extraction_warnings; nunca adivines.

Clasifica usando principalmente las preguntas 8, 9, 10 y 11, y después la 14, comentarios y calificaciones. Queja = dificultad, inconveniente, incumplimiento o valoración negativa. Sugerencia = propuesta de mejora sin queja. Felicitación = reconocimiento positivo explícito. Mixta = evidencia real de dos o más clases. "No", "ninguna" o "no tuvo dificultad" en 8–11 no es queja. Una respuesta vacía no prueba ninguna clase. Incluye en classification_evidence solo fragmentos visibles que justifiquen la categoría; sin evidencia usa Sin observaciones.

confidence es una estimación conservadora de legibilidad y respaldo del resultado completo, no certeza. Bájala ante manuscrito dudoso, contradicciones, recortes, baja resolución o datos clave ilegibles. Nunca uses alta confianza para compensar datos faltantes.

Prioridad institucional: Crítico para vida, seguridad, delito, acoso/violencia/discriminación grave, emergencia médica, datos personales o daño grave; Alto para queja grave, servicio malo, problema no resuelto o reiterado; Medio para servicio regular o inconformidad concreta; Bajo para mejora menor; Informativo para felicitación o neutral. Solo selecciona áreas activas: ${areas.join(", ")}. Sin evidencia usa Sin especificar.`,
      },
      { role: "user", content },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "survey_analysis",
        strict: true,
        schema,
      },
    },
  });
  const parsed = parseModelOutput(response.output_text);
  if (!parsed.is_survey)
    throw new InvalidSurveyError(parsed.survey_validation_reason);
  return {
    ...parsed,
    extracted_data: {
      general_data: parsed.general_data,
      numbered_answers: parsed.numbered_answers,
      negative_comments: parsed.negative_comments,
      service_ratings: parsed.service_ratings,
      classification_evidence: parsed.classification_evidence,
      extraction_warnings: parsed.extraction_warnings,
    },
    needs_review: requiresReview(parsed, threshold),
    model: process.env.OPENAI_MODEL || "gpt-5",
  };
}
