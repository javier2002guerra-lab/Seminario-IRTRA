import Shell from "@/components/Shell";
import { currentUser } from "@/lib/auth";
import { surveyScope } from "@/lib/scope";
import { parseMonth, previousMonth } from "@/lib/report-range";
import { executiveData } from "@/lib/executive";
export const dynamic = "force-dynamic";
export default async function Dashboard({ searchParams }) {
  const p = await searchParams,
    selected = parseMonth(p?.month),
    compared = parseMonth(p?.compare || previousMonth(selected.value)),
    user = await currentUser(),
    scope = surveyScope(user, "s"),
    [data, previous] = await Promise.all([
      executiveData({
        from: selected.from,
        to: new Date(new Date(selected.toExclusive).getTime() - 86400000)
          .toISOString()
          .slice(0, 10),
        scope,
      }),
      executiveData({
        from: compared.from,
        to: new Date(new Date(compared.toExclusive).getTime() - 86400000)
          .toISOString()
          .slice(0, 10),
        scope,
      }),
    ]);
  return (
    <Shell active="/">
      <div className="executive-heading">
        <div>
          <div className="eyebrow">Inteligencia empresarial</div>
          <h1 className="title">Centro ejecutivo de experiencia</h1>
          <p className="subtitle">
            Decisiones, riesgos y acciones respaldadas por la voz del huésped.
          </p>
        </div>
        <div className="freshness">
          <span className="status-dot" />
          Datos al {new Date(data.generatedAt).toLocaleString("es-GT")}
        </div>
      </div>
      <form className="toolbar card executive-filters">
        <label>
          Mes a consultar
          <input
            className="input"
            type="month"
            name="month"
            defaultValue={selected.value}
          />
        </label>
        <label>
          Comparar con
          <input
            className="input"
            type="month"
            name="compare"
            defaultValue={compared.value}
          />
        </label>
        <button className="btn">Actualizar tablero</button>
        <a
          className="btn secondary"
          href={`/reportes/ejecutivo?from=${data.from}&to=${data.to}`}
          target="_blank"
        >
          Informe ejecutivo
        </a>
      </form>
      <section className="executive-kpis">
        <Kpi
          title="Satisfacción general"
          value={
            data.kpis.satisfaction ? `${data.kpis.satisfaction}/5` : "Sin datos"
          }
          delta={delta(
            data.kpis.satisfaction,
            previous.kpis.satisfaction,
            "pts",
          )}
          tone={data.kpis.satisfaction >= 4 ? "good" : "warning"}
        />
        <Kpi
          title="Tasa de quejas"
          value={`${data.kpis.complaintRate}%`}
          delta={delta(
            previous.kpis.complaintRate,
            data.kpis.complaintRate,
            "pp",
          )}
          tone={data.kpis.complaintRate <= 20 ? "good" : "danger"}
        />
        <Kpi
          title="Resolución de casos"
          value={`${data.kpis.resolutionRate}%`}
          delta={delta(
            data.kpis.resolutionRate,
            previous.kpis.resolutionRate,
            "pp",
          )}
          tone="good"
        />
        <Kpi
          title="Cumplimiento de SLA"
          value={`${data.kpis.slaRate}%`}
          tone={data.kpis.slaRate >= 85 ? "good" : "warning"}
        />
        <Kpi
          title="Huéspedes recuperados"
          value={`${data.kpis.recoveryRate}%`}
          detail={`${data.recovery?.recovered || 0} de ${data.recovery?.contacted || 0} gestiones`}
        />
        <Kpi
          title="Acciones verificadas"
          value={`${data.kpis.actionRate}%`}
          detail={`Q ${Number(data.actions?.savings || 0).toLocaleString("es-GT")} de ahorro documentado`}
        />
      </section>
      {data.alerts.length > 0 && (
        <section className="executive-alerts">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Atención gerencial</div>
              <h2>Alertas predictivas y operativas</h2>
            </div>
            <a href="/alertas">Ver centro de alertas →</a>
          </div>
          <div className="alert-cards">
            {data.alerts.map((a, i) => (
              <article className={`insight-alert ${a.level}`} key={i}>
                <span>!</span>
                <div>
                  <b>{a.title}</b>
                  <p>{a.message}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="executive-layout">
        <section className="card wide">
          <div className="section-heading">
            <div>
              <h3>Evolución de experiencia</h3>
              <p className="muted">Volumen, quejas y satisfacción mensual.</p>
            </div>
          </div>
          <Trend rows={data.trend} />
        </section>
        <section className="card">
          <h3>Recomendaciones de ATLAS</h3>
          <p className="muted">
            Acciones sugeridas a partir de los indicadores del período.
          </p>
          <ol className="recommendations">
            {data.recommendations.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
          <a className="btn" href="/acciones">
            Crear plan de acción
          </a>
        </section>
        <section className="card">
          <h3>Ranking por sede o servicio</h3>
          <p className="muted">
            Ordenado por satisfacción; requiere calificaciones disponibles.
          </p>
          <Ranking rows={data.venues} />
        </section>
        <section className="card">
          <h3>Áreas que requieren atención</h3>
          <Ranking rows={data.areas} area />
        </section>
        <section className="card">
          <h3>Servicios peor calificados</h3>
          <Bars
            rows={data.services.map((x) => ({
              label: x.label,
              value: Number(x.negatives),
              note: `${x.score || "—"}/5`,
            }))}
          />
        </section>
        <section className="card">
          <h3>Temas más frecuentes</h3>
          <Bars rows={data.topics} />
        </section>
        <section className="card">
          <h3>Pronóstico histórico</h3>
          <div className="quality-score">{data.forecast.predicted}</div>
          <p>quejas proyectadas para el próximo mes</p>
          <div className="quality-details"><span>Confianza {data.forecast.confidence}</span><span>Pendiente {data.forecast.slope >= 0 ? "+" : ""}{data.forecast.slope}/mes</span><span>R² {data.forecast.r2 ?? "—"}</span></div>
          <p className="muted">Modelo: {data.forecast.method}. Es una proyección orientativa basada en los últimos 12 meses, no una certeza.</p>
        </section>
        <section className="card">
          <h3>Calidad de la IA</h3>
          <div className="quality-score">
            {Number(data.aiQuality?.reviewed || 0)
              ? `${Math.round((Number(data.aiQuality.exact || 0) / Number(data.aiQuality.reviewed)) * 100)}%`
              : "—"}
          </div>
          <p className="muted">
            Coincidencia exacta de clasificación y prioridad en casos evaluados.
          </p>
          <div className="quality-details">
            <span>{data.aiQuality?.reviewed || 0} evaluaciones</span>
            <span>
              {data.aiQuality?.fields_corrected || 0} campos corregidos
            </span>
            <span>
              {data.summary?.pending_review || 0} pendientes de revisión
            </span>
          </div>
        </section>
        <section className="card">
          <h3>Impacto empresarial documentado</h3>
          <div className="impact-value">
            Q{" "}
            {Number(data.actions?.savings || 0).toLocaleString("es-GT", {
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="muted">
            Ahorro estimado registrado en planes de acción verificados. Es una
            estimación operativa, no un dato contable.
          </p>
          <a href="/acciones">Ver evidencia de acciones →</a>
        </section>
      </div>
      <details className="card metric-methodology">
        <summary>Definiciones y metodología de los indicadores</summary>
        <ul>
          <li>
            <b>Satisfacción general:</b> promedio de calificaciones disponibles,
            escala 1 a 5.
          </li>
          <li>
            <b>Tasa de quejas:</b> encuestas “Queja” o “Mixta” entre encuestas
            del período.
          </li>
          <li>
            <b>Resolución:</b> casos “Resuelto” o “Cerrado” entre encuestas del
            período.
          </li>
          <li>
            <b>Cumplimiento SLA:</b> casos resueltos antes de la fecha límite
            entre casos resueltos.
          </li>
          <li>
            <b>Recuperación:</b> gestiones “Recuperado” entre gestiones de
            recuperación.
          </li>
          <li>
            <b>Acciones verificadas:</b> planes “Verificada” entre planes
            creados en el período.
          </li>
        </ul>
        <p className="muted">
          Fuente: base transaccional de IRTRA ENCUESTAS. Se actualiza al cargar
          la pantalla.
        </p>
      </details>
    </Shell>
  );
}
function Kpi({ title, value, delta: change, detail, tone = "neutral" }) {
  return (
    <article className={`card executive-kpi ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      {change && <small>{change}</small>}
      {detail && <small>{detail}</small>}
    </article>
  );
}
function delta(a, b, unit) {
  const n = Number(a || 0) - Number(b || 0);
  return `${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(unit === "pts" ? 1 : 0)} ${unit} frente al período comparado`;
}
function Trend({ rows }) {
  const max = Math.max(1, ...rows.map((x) => Number(x.total)));
  return rows.length ? (
    <div className="trend-chart">
      {rows.map((x) => (
        <div className="trend-column" key={x.label}>
          <div className="trend-bars">
            <i
              style={{
                height: `${Math.max(4, (Number(x.total) / max) * 100)}%`,
              }}
              title={`${x.total} encuestas`}
            />
            <i
              className="complaint"
              style={{
                height: `${Math.max(2, (Number(x.complaints) / max) * 100)}%`,
              }}
              title={`${x.complaints} quejas`}
            />
          </div>
          <b>{x.satisfaction || "—"}</b>
          <small>{x.label}</small>
        </div>
      ))}
    </div>
  ) : (
    <p className="muted">Aún no hay datos para mostrar la tendencia.</p>
  );
}
function Ranking({ rows, area = false }) {
  return (
    <div className="ranking">
      {rows.length ? (
        rows.map((x, i) => (
          <div key={x.label}>
            <span className="rank-number">{i + 1}</span>
            <span>
              <b>{x.label}</b>
              <small>
                {x.total} encuestas · {x.complaints} quejas
              </small>
            </span>
            <strong>
              {area ? `${x.resolved || 0} res.` : `${x.satisfaction || "—"}/5`}
            </strong>
          </div>
        ))
      ) : (
        <p className="muted">Sin datos suficientes.</p>
      )}
    </div>
  );
}
function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((x) => Number(x.value)));
  return (
    <div className="mini-bars">
      {rows.length ? (
        rows.map((x) => (
          <div key={x.label}>
            <span>{x.label}</span>
            <i>
              <b style={{ width: `${(Number(x.value) / max) * 100}%` }} />
            </i>
            <strong>
              {x.value}
              {x.note && <small>{x.note}</small>}
            </strong>
          </div>
        ))
      ) : (
        <p className="muted">Sin datos suficientes.</p>
      )}
    </div>
  );
}
