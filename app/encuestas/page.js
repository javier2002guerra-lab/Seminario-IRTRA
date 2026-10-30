import Shell from "@/components/Shell";
import { query } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { surveyScope } from "@/lib/scope";
export const dynamic = "force-dynamic";
function documentNumber(raw){try{return JSON.parse(raw||"{}").general_data?.document_number||"Sin dato"}catch{return "Sin dato"}}
export default async function Page({ searchParams }) {
  const p = await searchParams,
    user = await currentUser(),
    scope = surveyScope(user, "s");
  const clauses = [scope.where],
    vals = [...scope.params];
  const exact = {
    area: "a.id",
    priority: "s.priority",
    category: "s.category",
    service: "sr.service_name",
    status: "s.status",
  };
  if (p.q) {
    clauses.push("(s.original_name ILIKE ? OR s.summary ILIKE ? OR CAST(s.id AS TEXT)=?)");
    const term = String(p.q).trim().slice(0,120);
    vals.push(`%${term}%`, `%${term}%`, term);
  }
  for (const [k, col] of Object.entries(exact))
    if (p[k]) {
      clauses.push(`${col}=?`);
      vals.push(p[k]);
    }
  if (p.from) {
    clauses.push("date(s.created_at)>=date(?)");
    vals.push(p.from);
  }
  if (p.to) {
    clauses.push("date(s.created_at)<=date(?)");
    vals.push(p.to);
  }
  const rows = await query(
    `SELECT DISTINCT s.*,CASE s.priority WHEN 'Crítico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 WHEN 'Bajo' THEN 4 ELSE 5 END priority_order FROM surveys s LEFT JOIN survey_areas sa ON sa.survey_id=s.id LEFT JOIN areas a ON a.id=sa.area_id LEFT JOIN service_ratings sr ON sr.survey_id=s.id WHERE ${clauses.join(" AND ")} ORDER BY priority_order,s.created_at DESC`,
    ...vals,
  );
  const areas = user.role === "admin"
      ? await query("SELECT id,name FROM areas WHERE active=1 ORDER BY name")
      : await query("SELECT a.id,a.name FROM areas a JOIN user_areas ua ON ua.area_id=a.id WHERE ua.user_id=? AND a.active=1 ORDER BY a.name", user.id),
    services = await query(
      `SELECT DISTINCT sr.service_name FROM service_ratings sr JOIN surveys s ON s.id=sr.survey_id WHERE ${scope.where} ORDER BY sr.service_name`,
      ...scope.params,
    );
  const today = new Date().toISOString().slice(0,10), monthAgo = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  return (
    <Shell active="/encuestas">
      <div className="eyebrow">Gestión de casos</div>
      <h1 className="title">Encuestas procesadas</h1>
      <p className="subtitle">
        Consulta, filtra y da seguimiento según tus permisos.
      </p>
      <form className="toolbar">
        <input
          className="input"
          type="date"
          name="from"
          defaultValue={p.from}
        />
        <input className="input" type="date" name="to" defaultValue={p.to} />
        <select className="input" name="area" defaultValue={p.area || ""}>
          <option value="">Toda área</option>
          {areas.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <select
          className="input"
          name="priority"
          defaultValue={p.priority || ""}
        >
          <option value="">Toda prioridad</option>
          {["Crítico", "Alto", "Medio", "Bajo", "Informativo"].map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select
          className="input"
          name="category"
          defaultValue={p.category || ""}
        >
          <option value="">Toda clasificación</option>
          {[
            "Queja",
            "Sugerencia",
            "Felicitación",
            "Mixta",
            "Sin observaciones",
          ].map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select className="input" name="service" defaultValue={p.service || ""}>
          <option value="">Todo servicio</option>
          {services.map((x) => (
            <option key={x.service_name} value={x.service_name}>{x.service_name}</option>
          ))}
        </select>
        <select className="input" name="status" defaultValue={p.status || ""}>
          <option value="">Todo estado</option>
          {[
            "Recibido",
            "En procesamiento",
            "Procesado",
            "Pendiente de revisión",
            "Asignado",
            "En atención",
            "Resuelto",
            "Cerrado",
            "Error",
          ].map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <button className="btn">Filtrar</button>
      </form>
      <form className="toolbar card" action="/api/export" method="get">
        <b>Exportar datos actuales</b>
        <label>Desde <input className="input" type="date" name="from" defaultValue={p.from || monthAgo} required /></label>
        <label>Hasta <input className="input" type="date" name="to" defaultValue={p.to || today} required /></label>
        <span className="muted">Puedes exportar cualquier intervalo de fechas.</span>
        <button className="btn secondary" type="submit">Exportar XLSM</button>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>No. boleta</th>
              <th>Resumen</th>
              <th>Categoría</th>
              <th>Prioridad</th>
              <th>Confianza</th>
              <th>Estado</th>
              <th>SLA</th>
              <th>Validación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`/encuestas/${r.id}`}>
                    <b>{r.original_name}</b>
                  </a>
                  <br />
                  <small>{new Date(r.created_at).toLocaleString("es-GT")}</small>
                </td>
                <td>{documentNumber(r.extracted_data)}</td>
                <td>{r.summary || "Pendiente"}</td>
                <td>{r.category}</td>
                <td>
                  <span className={`badge ${r.priority}`}>{r.priority}</span>
                </td>
                <td>{Math.round(r.confidence * 100)}%</td>
                <td>{r.status}</td>
                <td>{r.due_at ? <span className={`badge ${["Resuelto","Cerrado","Error"].includes(r.status) ? "sla-track" : new Date(r.due_at) < new Date() ? "sla-overdue" : "sla-risk"}`}>{["Resuelto","Cerrado","Error"].includes(r.status) ? "Finalizado" : new Date(r.due_at) < new Date() ? "Vencido" : new Date(r.due_at).toLocaleString("es-GT")}</span> : "—"}</td>
                <td><span className="badge">{r.validation_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
