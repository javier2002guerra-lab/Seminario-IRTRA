import Shell from "@/components/Shell";
import { query } from "@/lib/db";
import ActionManager, { ActionUpdate } from "./action-manager";
import { currentUser } from "@/lib/auth";
import { surveyScope } from "@/lib/scope";
export const dynamic = "force-dynamic";
export default async function ActionsPage() {
  const user = await currentUser();
  const scope = surveyScope(user, "s");
  const actionWhere = user.role === "admin"
    ? "1=1"
    : `((ap.survey_id IS NOT NULL AND ${scope.where}) OR (ap.survey_id IS NULL AND EXISTS (SELECT 1 FROM user_areas action_ua WHERE action_ua.user_id=? AND action_ua.area_id=ap.area_id)))`;
  const actionParams = user.role === "admin" ? [] : [...scope.params, user.id];
  const [plans, areas, users, surveys] = await Promise.all([
    query(
      `SELECT ap.*,a.name area_name,u.name owner_name,s.original_name FROM action_plans ap LEFT JOIN areas a ON a.id=ap.area_id LEFT JOIN users u ON u.id=ap.owner_id LEFT JOIN surveys s ON s.id=ap.survey_id WHERE ${actionWhere} ORDER BY CASE ap.status WHEN 'En ejecución' THEN 1 WHEN 'Pendiente' THEN 2 WHEN 'Verificada' THEN 3 ELSE 4 END,ap.due_at NULLS LAST,ap.id DESC`,
      ...actionParams,
    ),
    user.role === "admin" ? query("SELECT id,name FROM areas WHERE active=1 ORDER BY name") : query("SELECT a.id,a.name FROM areas a JOIN user_areas ua ON ua.area_id=a.id WHERE ua.user_id=? AND a.active=1 ORDER BY a.name",user.id),
    user.role === "admin" ? query("SELECT id,name FROM users WHERE active=1 ORDER BY name") : query("SELECT DISTINCT u.id,u.name FROM users u JOIN user_areas their ON their.user_id=u.id JOIN user_areas mine ON mine.area_id=their.area_id WHERE mine.user_id=? AND u.active=1 ORDER BY u.name",user.id),
    query(`SELECT s.id,s.original_name FROM surveys s WHERE ${scope.where} ORDER BY s.id DESC LIMIT 100`,...scope.params),
  ]);
  const open = plans.filter((x) =>
      ["Pendiente", "En ejecución"].includes(x.status),
    ).length,
    overdue = plans.filter(
      (x) =>
        ["Pendiente", "En ejecución"].includes(x.status) &&
        x.due_at &&
        new Date(x.due_at) < new Date(),
    ).length,
    verified = plans.filter((x) => x.status === "Verificada").length,
    savings = plans
      .filter((x) => x.financial_status === "Validado")
      .reduce((n, x) => n + Number(x.actual_savings || 0), 0);
  return (
    <Shell active="/acciones">
      <div className="eyebrow">Mejora continua</div>
      <h1 className="title">Planes de acción</h1>
      <p className="subtitle">
        Convierte hallazgos en responsables, fechas, evidencia y resultados
        verificables.
      </p>
      <div className="grid action-metrics">
        <Metric label="Acciones abiertas" value={open} />
        <Metric label="Vencidas" value={overdue} />
        <Metric label="Verificadas" value={verified} />
        <Metric
          label="Ahorro documentado"
          value={`Q ${savings.toLocaleString("es-GT", { minimumFractionDigits: 2 })}`}
        />
      </div>
      <ActionManager areas={areas} users={users} surveys={surveys} />
      <div className="card table-scroll">
        <h3>Seguimiento de acciones</h3>
        <table>
          <thead>
            <tr>
              <th>Acción</th>
              <th>Origen</th>
              <th>Responsable</th>
              <th>Prioridad</th>
              <th>Fecha límite</th>
              <th>Estado</th>
              <th>Gestión</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.title}</b>
                  <small className="table-subtitle">{p.description}</small>
                </td>
                <td>
                  {p.original_name ? (
                    <a href={`/encuestas/${p.survey_id}`}>
                      Encuesta #{p.survey_id}
                    </a>
                  ) : (
                    "Hallazgo general"
                  )}
                </td>
                <td>
                  {p.owner_name || "Sin asignar"}
                  <small className="table-subtitle">{p.area_name}</small>
                </td>
                <td>
                  <span className={`badge ${p.priority}`}>{p.priority}</span>
                </td>
                <td>
                  {p.due_at
                    ? new Date(p.due_at).toLocaleString("es-GT")
                    : "Sin fecha"}
                </td>
                <td>
                  <span
                    className={`badge action-${p.status.replace(" ", "-")}`}
                  >
                    {p.status}
                  </span>
                </td>
                <td>
                  <ActionUpdate plan={p} isAdmin={user?.role === "admin"} />
                </td>
              </tr>
            ))}
            {!plans.length && (
              <tr>
                <td colSpan="7">Todavía no hay planes de acción.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
function Metric({ label, value }) {
  return (
    <div className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
