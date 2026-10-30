import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { get, query, run, transaction, closeDatabase } from "../lib/db.js";
import { saveOriginal } from "../lib/files.js";

const db = new URL(process.env.DATABASE_URL || "http://invalid");
if (process.env.QA_ONLY !== "true" || db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/irtra_qa")
  throw new Error("La demostración solo puede preparar su base sintética dedicada.");
const date = new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
const examples = [
  { category: "Queja", priority: "Alto", text: "La comida se sirvió fría.", topic: "Temperatura de alimentos", area: "Restaurantes", restaurant: "LA HACIENDA", service: "Calidad de comida", rating: "Malo", question: 9, confirmed: true },
  { category: "Sugerencia", priority: "Bajo", text: "Colocar más sombra en la zona de espera.", topic: "Sombra en zonas de espera", area: "Mantenimiento", origin_place: "Spa", service: "Mantenimiento de instalaciones", rating: "Bueno", question: 14, confirmed: false },
  { category: "Felicitación", priority: "Informativo", text: "Excelente atención del personal durante la visita.", topic: "Atención del personal", area: "Habitaciones", hotel: "SAN MARTIN", service: "Cortesía del personal", rating: "Excelente", question: 14, confirmed: true },
];
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
try {
  const admin = await get("SELECT id FROM users WHERE email=?", process.env.SUPERUSER_EMAIL);
  if (!admin) throw new Error("Ejecute primero npm run qa:setup.");
  // Remove only the named synthetic browser fixtures, preserving demonstration
  // edits and all unrelated records even inside this dedicated QA database.
  await transaction(async () => {
    const fixtures = await query("SELECT id FROM surveys WHERE original_name IN ('qa-sintetica.png','qa-imagen.png','flujo-prueba.png','boleta-prueba.png')");
    for (const fixture of fixtures) {
      for (const table of ["corrections", "followups", "service_ratings", "survey_areas", "ai_evaluations", "guest_recovery", "deletion_requests"])
        await run(`DELETE FROM ${table} WHERE survey_id=?`, fixture.id);
      await run("DELETE FROM surveys WHERE id=?", fixture.id);
    }
  });
  await run("UPDATE users SET active=1,password_hash=?,mfa_enabled=0,mfa_secret=NULL,mfa_pending_secret=NULL,mfa_last_counter=NULL,recovery_codes='[]',must_change_password=0,session_version=session_version+1 WHERE id=?", await bcrypt.hash(process.env.SUPERUSER_PASSWORD, 12), admin.id);
  await run("DELETE FROM login_attempts");
  await run("DELETE FROM request_limits WHERE key LIKE 'mfa:%'");
  for (const [index, example] of examples.entries()) {
    const name = `DEMO-SINTETICA-${index + 1}.png`;
    if (await get("SELECT id FROM surveys WHERE original_name=?", name)) continue;
    const documentNumber = `DEMO-000${index + 1}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="white"/><rect width="1200" height="190" fill="#087d70"/><g font-family="Arial" font-size="30" fill="#163640"><text x="60" y="80" fill="white" font-size="44">ENCUESTA SINTÉTICA · DEMOSTRACIÓN</text><text x="60" y="140" fill="white">Sin datos personales reales · No es una boleta institucional</text><text x="60" y="260">No. ${documentNumber}</text><text x="60" y="330">1. Nombre: Visitante DEMO ${index + 1}</text><text x="60" y="400">2. Afiliado: Sí</text><text x="60" y="470">3. Fecha: ${escape(date)}</text><text x="60" y="540">5. Razón de visita: ${escape(example.restaurant ? "Restaurante" : example.hotel ? "Huésped" : "Club Los Corozos")}</text><text x="60" y="640">6. ${escape(example.service)}: ${escape(example.rating)}</text><text x="60" y="740">7. ¿Recomienda visitar Los Hostales? Sí</text><text x="60" y="840">${example.question}. Comentario visible:</text><text x="60" y="910">${escape(example.text)}</text><text x="60" y="1170" font-size="25">Transcripción controlada para verificar edición y exportación.</text><text x="60" y="1230" font-size="25">Este ejemplo no mide la precisión de ningún modelo de IA.</text></g></svg>`;
    const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
    const stored = saveOriginal(bytes, "png");
    const general = { document_number: documentNumber, visitor_name: `Visitante DEMO ${index + 1}`, affiliate_status: "Sí", visit_date: date, visit_reason: example.restaurant ? "Restaurante" : example.hotel ? "Huésped" : "Club Los Corozos", restaurant: example.restaurant || null, hotel: example.hotel || null, origin_place: example.origin_place || null };
    const numbered = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`item_${i + 1}`, null]));
    numbered.item_7 = "Sí"; numbered[`item_${example.question}`] = example.text;
    const extracted = { general_data: general, numbered_answers: numbered, negative_comments: example.category === "Queja" ? [example.text] : [], classification_evidence: [{ source: `Pregunta ${example.question}`, text: example.text }], extraction_warnings: ["Documento sintético con transcripción controlada. No representa un análisis real de IA."] };
    await transaction(async () => {
      const inserted = await run("INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,priority,confidence,summary,primary_topic,extracted_data,ai_original,model,needs_review,validation_status,restaurant,hotel,origin_place,created_by,confirmed_by,confirmed_at) VALUES(?,?,'image/png',?,?,?,?,?,0,?,?,?,?,'demo-transcripcion-controlada',?,?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END) RETURNING id",
        name, stored, bytes.length, crypto.createHash("sha256").update(bytes).digest("hex"), example.confirmed ? "Procesado" : "Pendiente de revisión", example.category, example.priority, example.text, example.topic, JSON.stringify(extracted), JSON.stringify({ ...example, extracted_data: extracted }), example.confirmed ? 0 : 1, example.confirmed ? "Confirmada" : "Pendiente de revisión", example.restaurant || null, example.hotel || null, example.origin_place || null, admin.id, example.confirmed ? admin.id : null, example.confirmed);
      await run("INSERT INTO survey_files(survey_id,content) VALUES(?,?)", inserted.lastInsertRowid, bytes);
      await run("INSERT INTO survey_areas(survey_id,area_id) SELECT ?,id FROM areas WHERE name=?", inserted.lastInsertRowid, example.area);
      await run("INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,?,?,?)", inserted.lastInsertRowid, example.service, example.rating, { Excelente: 5, Bueno: 4, Malo: 1 }[example.rating], example.rating === "Malo" ? 1 : 0);
    });
  }
  fs.writeFileSync(path.join(".qa", "ACCESO_LOCAL.txt"), `SOLO DEMOSTRACIÓN LOCAL - NO PUBLICAR\nURL: https://localhost:3444\nCorreo: ${process.env.SUPERUSER_EMAIL}\nContraseña: ${process.env.SUPERUSER_PASSWORD}\n\nAl entrar, registre su propio autenticador MFA y guarde los códigos de recuperación.\nLos documentos DEMO-SINTETICA son ejemplos ficticios, sin análisis externo.\n`, { mode: 0o600 });
  console.log("Demostración preparada: tres boletas sintéticas. Acceso privado en .qa/ACCESO_LOCAL.txt; registre su propio MFA al entrar.");
} finally { await closeDatabase(); }
