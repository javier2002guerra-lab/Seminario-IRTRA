import { executiveData } from "@/lib/executive";
import PrintButton from "./print-button";
import { currentUser } from "@/lib/auth";
import { surveyScope } from "@/lib/scope";
export const dynamic = "force-dynamic";
function date(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : fallback;
}
export default async function ExecutiveReport({ searchParams }) {
  const user = await currentUser(),
    p = await searchParams,
    today = new Date().toISOString().slice(0, 10),
    from = date(p.from, `${today.slice(0, 8)}01`),
    to = date(p.to, today),
    data = await executiveData({ from, to, scope: surveyScope(user, "s") });
  return (
    <main className="print-report">
      <header className="print-cover">
        <div>
          <span>IRTRA ENCUESTAS</span>
          <h1>Informe ejecutivo de experiencia</h1>
          <p>Voz del huésped, riesgos operativos y mejora continua</p>
        </div>
        <div className="print-meta">
          <b>Período</b>
          <span>
            {from} al {to}
          </span>
          <b>Generado</b>
          <span>{new Date(data.generatedAt).toLocaleString("es-GT")}</span>
        </div>
      </header>
      <div className="print-toolbar">
        <PrintButton />
        <a className="btn secondary" href="/reportes">
          Volver a Reportes
        </a>
      </div>
      <section>
        <h2>Resumen para la dirección</h2>
        <p>
          Durante el período se procesaron <b>{data.kpis.total} encuestas</b>.
          La satisfacción media fue de{" "}
          <b>{data.kpis.satisfaction || "sin datos"}/5</b>, con una tasa de
          quejas de <b>{data.kpis.complaintRate}%</b> y una resolución de casos
          de <b>{data.kpis.resolutionRate}%</b>.
        </p>
        <div className="print-kpis">
          <Kpi
            label="Satisfacción"
            value={`${data.kpis.satisfaction || "—"}/5`}
          />
          <Kpi label="Quejas" value={`${data.kpis.complaintRate}%`} />
          <Kpi label="Resolución" value={`${data.kpis.resolutionRate}%`} />
          <Kpi label="SLA cumplido" value={`${data.kpis.slaRate}%`} />
          <Kpi label="Recuperación" value={`${data.kpis.recoveryRate}%`} />
          <Kpi
            label="Acciones verificadas"
            value={`${data.kpis.actionRate}%`}
          />
        </div>
      </section>
      <section>
        <h2>Riesgos y decisiones recomendadas</h2>
        {data.alerts.length ? (
          <div className="print-alerts">
            {data.alerts.map((x, i) => (
              <article key={i}>
                <b>{x.title}</b>
                <p>{x.message}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>No se detectaron alertas críticas con las reglas actuales.</p>
        )}
        <ol>
          {data.recommendations.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      </section>
      <div className="print-columns">
        <section>
          <h2>Servicios prioritarios</h2>
          <Table
            rows={data.services}
            columns={[
              ["label", "Servicio"],
              ["negatives", "Negativas"],
              ["score", "Promedio"],
            ]}
          />
        </section>
        <section>
          <h2>Áreas con mayor volumen de quejas</h2>
          <Table
            rows={data.areas}
            columns={[
              ["label", "Área"],
              ["complaints", "Quejas"],
              ["resolved", "Resueltas"],
            ]}
          />
        </section>
      </div>
      <section>
        <h2>Planes de acción e impacto</h2>
        <p>
          <b>{data.actions?.verified || 0}</b> planes verificados de{" "}
          <b>{data.actions?.total || 0}</b>. Ahorro operativo documentado:{" "}
          <b>
            Q{" "}
            {Number(data.actions?.savings || 0).toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </b>
          .
        </p>
        <small>
          El ahorro es una estimación documentada por los responsables de cada
          plan y no sustituye información contable auditada.
        </small>
      </section>
      <footer>
        IRTRA ENCUESTAS · Informe generado automáticamente con datos del sistema
        · La validación final corresponde a los responsables institucionales.
      </footer>
    </main>
  );
}
function Kpi({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function Table({ rows, columns }) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map(([, label]) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map(([key]) => (
              <td key={key}>{row[key] ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
