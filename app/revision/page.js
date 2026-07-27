import Shell from "@/components/Shell";
import { query } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { surveyScope } from "@/lib/scope";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser(),
    scope = surveyScope(user, "s");
  const rows = await query(
    `SELECT s.* FROM surveys s WHERE s.needs_review=1 AND ${scope.where} ORDER BY CASE WHEN confidence<0.85 THEN 0 ELSE 1 END,confidence ASC,CASE priority WHEN 'Crítico' THEN 1 WHEN 'Alto' THEN 2 ELSE 3 END,created_at`,
    ...scope.params,
  );
  return (
    <Shell active="/revision">
      <div className="eyebrow">Control humano</div>
      <h1 className="title">Bandeja de revisión</h1>
      <p className="subtitle">
        Valida resultados críticos, ambiguos o con baja confianza.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Caso</th>
              <th>Motivo</th>
              <th>Prioridad</th>
              <th>Confianza</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.original_name}</b>
                </td>
                <td>
                  {Number(r.confidence) < .85
                    ? "Confianza menor a 85%"
                    : r.priority === "Crítico"
                    ? "Caso crítico"
                    : "Confianza o asignación requiere validación"}
                </td>
                <td>
                  <span className={`badge ${r.priority}`}>{r.priority}</span>
                </td>
                <td>{Math.round(r.confidence * 100)}%</td>
                <td>
                  <a className="btn secondary" href={`/encuestas/${r.id}`}>
                    Revisar
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
