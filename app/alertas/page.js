import Link from "next/link";
import Shell from "@/components/Shell";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { executiveData } from "@/lib/executive";
import { surveyScope } from "@/lib/scope";
import AlertActions from "./alert-actions";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await currentUser();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const scope = surveyScope(user, "s");
  const [alerts, intelligence] = await Promise.all([
    query(
      `SELECT n.*,s.priority,s.status,s.due_at
       FROM notifications n
       LEFT JOIN surveys s ON s.id=n.survey_id
       WHERE n.user_id=? AND (n.survey_id IS NULL OR ${scope.where})
       ORDER BY (n.read_at IS NULL) DESC,n.created_at DESC LIMIT 200`,
      user.id,
      ...scope.params,
    ),
    executiveData({ from, to, scope }),
  ]);
  return (
    <Shell active="/alertas">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Centro de atención</div>
          <h1 className="title">Alertas operativas</h1>
          <p className="subtitle">Riesgos, vencimientos, tendencias y escalaciones que requieren acción.</p>
        </div>
        <AlertActions />
      </div>
      {intelligence.alerts.length > 0 && (
        <section className="alert-cards" style={{ marginBottom: 18 }}>
          {intelligence.alerts.map((item, index) => (
            <article className={`insight-alert ${item.level}`} key={index}>
              <span>!</span>
              <div><b>{item.title}</b><p>{item.message}</p><a href="/acciones">Crear plan de acción →</a></div>
            </article>
          ))}
        </section>
      )}
      <div className="card alert-list">
        {alerts.length ? alerts.map((item) => (
          <Link className={`alert-item ${item.read_at ? "read" : ""}`} href={`/encuestas/${item.survey_id}`} key={item.id}>
            <span className={`status-dot ${item.type === "SLA_OVERDUE" ? "danger" : "warning"}`} />
            <span><b>{item.title}</b><small>{item.message}</small></span>
            <span><span className={`badge ${item.priority}`}>{item.priority}</span><small>{new Date(item.created_at).toLocaleString("es-GT")}</small></span>
          </Link>
        )) : (
          <div className="empty-state"><b>Sin alertas individuales pendientes</b><p>Consulta arriba los indicadores predictivos del período.</p></div>
        )}
      </div>
    </Shell>
  );
}
