import Shell from "@/components/Shell";
import { get, query } from "@/lib/db";
import { notFound } from "next/navigation";
import ReviewForm from "./review-form";
import FollowupForm from "./followup-form";
import { currentUser } from "@/lib/auth";
import { surveyScope } from "@/lib/scope";
import ReviewWorkspace from "./review-workspace";
import ValidationActions from "./validation-actions";import DeleteSurvey from "./delete-survey";
import "@/app/correction-history.css";
export const dynamic = "force-dynamic";
export default async function Page({ params }) {
  const { id } = await params,
    user = await currentUser(),
    scope = surveyScope(user, "s");
  const r = await get(
    `SELECT s.* FROM surveys s WHERE s.id=? AND ${scope.where}`,
    Number(id),
    ...scope.params,
  );
  if (!r) notFound();
  const areas = await query("SELECT * FROM areas WHERE active=1 ORDER BY name"),
    assigned = (await query(
      "SELECT a.name FROM areas a JOIN survey_areas sa ON sa.area_id=a.id WHERE sa.survey_id=?",
      r.id,
    )).map((x) => x.name),
    history = await query(
      "SELECT c.*,u.name user_name FROM corrections c JOIN users u ON u.id=c.user_id WHERE survey_id=? ORDER BY c.id DESC",
      r.id,
    ),
    followups = await query(
      "SELECT f.*,u.name user_name FROM followups f JOIN users u ON u.id=f.user_id WHERE survey_id=? ORDER BY f.id DESC",
      r.id,
    ),
    assignees = await query(
      "SELECT DISTINCT u.id,u.name FROM users u WHERE u.active=1 AND u.role IN ('admin','verificador') ORDER BY u.name",
    ),
    ratings = await query("SELECT service_name,rating,score,negative FROM service_ratings WHERE survey_id=? ORDER BY id",r.id),
    deletionRequest = await get("SELECT d.*,u.name requester_name FROM deletion_requests d JOIN users u ON u.id=d.requested_by WHERE d.survey_id=? AND d.status='Pendiente' ORDER BY d.id DESC LIMIT 1",r.id);
  return (
    <Shell active="/encuestas">
      <div className="eyebrow">Caso #{r.id}</div>
      <h1 className="title">{r.original_name}</h1>
      <p className="subtitle">
        Resultado automático, validación humana y seguimiento completo.
      </p>
      <div className="grid two">
        <div className="card">
          <h3>Resumen ejecutivo</h3>
          <p>{r.summary || "Sin resumen disponible."}</p>
          <p>
            <b>Tema:</b> {r.primary_topic || "Sin determinar"}
          </p>
          <p>
            <b>Áreas:</b> {assigned.join(", ") || "Sin especificar"}
          </p>
          <p>
            <b>Justificación:</b> {r.priority_reason}
          </p>
          <div className="toolbar">
            <span className={`badge ${r.priority}`}>{r.priority}</span>
            <span className="badge">{r.category}</span>
            <span className="badge">
              Confianza {Math.round(r.confidence * 100)}%
            </span>
            <a className="btn secondary" href={`/api/surveys/${r.id}/file`}>
              Documento original
            </a>
          </div>
        </div>
        {["admin", "verificador"].includes(user.role) && <ReviewForm record={r} areas={areas} assigned={assigned} />}
      </div>
      <AnalysisEvidence record={r} />
      <ReviewWorkspace record={r} ratings={ratings} canEdit={["admin", "verificador"].includes(user.role)} />
      {["admin", "verificador"].includes(user.role) && <ValidationActions record={r} />}
      {["admin", "verificador"].includes(user.role) && (
        <FollowupForm record={r} assignees={assignees} />
      )}
      <div className="card" style={{ marginTop: 18 }}>
        <h3>Seguimiento</h3>
        {followups.map((h) => (
          <p key={`f${h.id}`}>
            <b>{h.user_name}</b>: {h.comment}{" "}
            <span className="badge">{h.status}</span>{" "}
            <small>{new Date(h.created_at).toLocaleString("es-GT")}</small>
          </p>
        ))}
        <h3>Correcciones</h3>
        {history.length ? (
          history.map((h) => (
            <CorrectionCard correction={h} key={h.id} />
          ))
        ) : (
          <p className="muted">Sin correcciones humanas.</p>
        )}
      </div>
      {["admin", "verificador"].includes(user.role) && <DeleteSurvey id={r.id} role={user.role} request={deletionRequest || null} />}
    </Shell>
  );
}

const fieldLabels = {
  "general_data.document_number": "Número de boleta",
  "general_data.visitor_name": "Nombre del visitante",
  "general_data.affiliate_status": "Afiliado",
  "general_data.visit_date": "Fecha de visita",
  "general_data.email": "Correo electrónico",
  "general_data.phone": "Teléfono",
  "general_data.room_number": "Habitación",
  "general_data.visit_reason": "Razón de la visita",
  "general_data.origin_place": "Lugar de origen",
  "general_data.restaurant": "Restaurante",
  "general_data.hotel": "Hotel",
  category: "Categoría",
  priority: "Prioridad",
  summary: "Resumen",
  primary_topic: "Tema principal",
};
for (let i = 1; i <= 14; i++) fieldLabels[`numbered_answers.item_${i}`] = `Respuesta ${i}`;

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
function flatten(value, prefix = "", output = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}.${key}` : key, output);
  } else output[prefix] = value;
  return output;
}
function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Sin dato";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function correctionChanges(correction) {
  if (correction.field !== "datos_extraidos")
    return [{ label: fieldLabels[correction.field] || correction.field, before: correction.previous_value, after: correction.new_value }];
  const before = parseJson(correction.previous_value), after = parseJson(correction.new_value);
  if (!before || !after)
    return [{ label: "Datos extraídos", before: correction.previous_value, after: correction.new_value }];
  const left = flatten(before), right = flatten(after);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .map((key) => ({ label: fieldLabels[key] || key.replaceAll("_", " "), before: left[key], after: right[key] }));
}
function CorrectionCard({ correction }) {
  const changes = correctionChanges(correction);
  return <article className="correction-card">
    <header className="correction-header">
      <div><b>{correction.user_name}</b><span> realizó {changes.length} {changes.length === 1 ? "corrección" : "correcciones"}</span></div>
      <time>{new Date(correction.created_at).toLocaleString("es-GT")}</time>
    </header>
    <div className="correction-list">
      {changes.map((change, index) => <div className="correction-row" key={`${change.label}-${index}`}>
        <b>{change.label}</b>
        <span className="correction-before">{displayValue(change.before)}</span>
        <span className="correction-arrow">→</span>
        <span className="correction-after">{displayValue(change.after)}</span>
      </div>)}
    </div>
    <footer><b>Motivo:</b> {correction.reason}</footer>
  </article>;
}

function AnalysisEvidence({ record }) {
  let data = {};
  try { data = JSON.parse(record.extracted_data || "{}"); } catch {}
  const evidence = data.classification_evidence || [], warnings = data.extraction_warnings || [];
  return <div className="card" style={{marginTop:18}}>
    <h3>Respaldo del análisis automático</h3>
    <p><b>Porcentaje estimado de acierto:</b> {Math.round(record.confidence * 100)}% {record.confidence < .85 && <span className="badge review-low">Prioridad de revisión: menor a 85%</span>}</p>
    <p className="muted">Es una estimación de legibilidad y evidencia, no una garantía. La confirmación final es humana.</p>
    <h4>Evidencia para la clasificación</h4>
    {evidence.length ? <ul>{evidence.map((x,i)=><li key={i}><b>{x.source}:</b> “{x.text}”</li>)}</ul> : <p className="muted">No se registró evidencia textual; revise el original.</p>}
    {warnings.length > 0 && <><h4>Campos dudosos o no legibles</h4><ul>{warnings.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
  </div>;
}
