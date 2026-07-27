"use client";
import { useState } from "react";

const services = [
  "Cortesía del personal", "Prontitud en chequeo de ingreso y salida",
  "Limpieza de habitaciones", "Limpieza de sanitarios", "Mantenimiento de instalaciones",
  "Jardines", "Servicio de maleteros", "Calidad de comida",
  "Prontitud en revisión de inventarios", "Servicio Club Los Corozos",
  "Servicio en tiendas de conveniencia", "Servicio en personal de eventos",
  "Servicio en Restaurante", "Personal de seguridad",
];
const choices = ["Excelente", "Bueno", "Regular", "Malo", "Sin dato"];
const questions = [
  [7, "¿Recomienda visitar Los Hostales?"],
  [8, "¿Tuvo alguna dificultad durante su visita?"],
  [9, "¿Cuál fue?"],
  [10, "¿Le resolvieron el inconveniente a tiempo?"],
  [11, "¿Algún colaborador le causó inconvenientes?"],
  [12, "¿Quién le atendió?"],
  [13, "Nombre del colaborador que le atendió"],
  [14, "¿Qué podemos hacer para mejorar su visita?"],
];

export default function DataEditor({ record, ratings = [] }) {
  let extracted = {};
  try { extracted = JSON.parse(record.extracted_data || "{}"); } catch {}
  const g = extracted.general_data || {}, n = extracted.numbered_answers || {};
  const ratingMap = new Map(ratings.map(x => [x.service_name, x.rating]));
  const [msg, setMsg] = useState(""), [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault(); setSaving(true); setMsg("");
    const fd = new FormData(event.currentTarget), general = {}, numbered = {};
    for (const key of ["document_number","visitor_name","affiliate_status","visit_date","email","phone","room_number","visit_reason"])
      general[key] = fd.get(key);
    for (let i=1;i<=14;i++) numbered[`item_${i}`] = fd.get(`item_${i}`);
    const body = {
      general, numbered,
      ratings: services.map(service => ({service, rating: fd.get(`service:${service}`) || "Sin dato"})),
      restaurant: fd.get("restaurant"), hotel: fd.get("hotel"), reason: fd.get("reason"),
    };
    const response = await fetch(`/api/surveys/${record.id}/data`, {method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const result = await response.json(); setSaving(false);
    setMsg(response.ok ? "Datos guardados correctamente. La encuesta queda pendiente de confirmación." : result.error);
    if (response.ok) setTimeout(()=>location.reload(),900);
  }

  return <form className="survey-editor" onSubmit={save}>
    {Array.from({length:6},(_,i)=><input key={i} type="hidden" name={`item_${i+1}`} value={n[`item_${i+1}`] || ""} readOnly/>)}
    <header className="editor-header">
      <div className="editor-logo">IRTRA</div>
      <div><h2>Estimado visitante</h2><p>Revise y corrija los datos extraídos comparándolos con la boleta original.</p></div>
      <label className="editor-number">No.<input name="document_number" defaultValue={g.document_number || ""} placeholder="Sin dato"/></label>
    </header>

    <section className="editor-lines">
      <EditorLine no="1" label="Nombre"><input name="visitor_name" defaultValue={g.visitor_name || ""}/></EditorLine>
      <EditorLine no="2" label="Afiliado"><input name="affiliate_status" defaultValue={g.affiliate_status || ""}/></EditorLine>
      <div className="editor-split">
        <EditorLine no="3" label="Fecha"><input name="visit_date" defaultValue={g.visit_date || ""}/></EditorLine>
        <EditorLine label="Teléfono"><input name="phone" defaultValue={g.phone || ""}/></EditorLine>
      </div>
      <EditorLine no="4" label="Correo electrónico"><input type="email" name="email" defaultValue={g.email || ""}/></EditorLine>
      <EditorLine no="5" label="Razón de su visita"><input name="visit_reason" defaultValue={g.visit_reason || ""}/></EditorLine>
      <div className="editor-split">
        <EditorLine label="Restaurante"><select name="restaurant" defaultValue={record.restaurant || g.restaurant || ""}><option value="">Sin especificar</option>{["La Hacienda","Arekas","Corozos","Kapahapa"].map(x=><option key={x}>{x}</option>)}</select></EditorLine>
        <EditorLine label="Hotel"><select name="hotel" defaultValue={record.hotel || g.hotel || ""}><option value="">Sin especificar</option>{["San Martín","Santa Cruz","Ranchería","Palajunoj"].map(x=><option key={x}>{x}</option>)}</select></EditorLine>
      </div>
      <EditorLine label="Habitación"><input name="room_number" defaultValue={g.room_number || ""}/></EditorLine>
    </section>

    <h3 className="editor-band">6. Califique marcando una opción para cada servicio</h3>
    <div className="rating-table-wrap"><table className="rating-editor"><thead><tr><th>Servicios</th>{choices.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>
      {services.map(service=><tr key={service}><td>{service}</td>{choices.map(choice=><td key={choice}><label className="rating-choice"><input type="radio" name={`service:${service}`} value={choice} defaultChecked={(ratingMap.get(service)||"Sin dato")===choice}/><span>{choice === "Sin dato" ? "—" : "X"}</span></label></td>)}</tr>)}
    </tbody></table></div>

    <section className="editor-questions">
      {questions.map(([no,label])=><EditorLine key={no} no={String(no)} label={label}><textarea name={`item_${no}`} defaultValue={n[`item_${no}`] || ""}/></EditorLine>)}
    </section>
    <footer className="editor-actions">
      <label>Motivo de la corrección<textarea name="reason" required minLength="5" placeholder="Ejemplo: verificación contra la imagen original"/></label>
      <button className="btn" disabled={saving}>{saving ? "Guardando…" : "Guardar todos los cambios"}</button>
      {msg && <p className={msg.startsWith("Datos guardados") ? "save-ok" : "notice"}>{msg}</p>}
    </footer>
  </form>;
}

function EditorLine({no,label,children}) {
  return <label className="editor-line">{no && <b>{no}.</b>}<strong>{label}</strong>{children}</label>;
}
