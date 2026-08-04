import { get, query } from "./db.js";

export async function executiveData({
  from,
  to,
  scope = { where: "1=1", params: [] },
}) {
  const where = `${scope.where} AND s.created_at>=?::date AND s.created_at<?::date + INTERVAL '1 day'`,
    args = [...scope.params, from, to];
  const [
    summary,
    quality,
    operations,
    actions,
    recovery,
    trend,
    areas,
    venues,
    topics,
    services,
    aiQuality,
    riskTrend,
    history,
  ] = await Promise.all([
    get(
      `SELECT count(*)::int total,count(*) FILTER(WHERE category IN ('Queja','Mixta'))::int complaints,count(*) FILTER(WHERE category='Felicitación')::int compliments,count(*) FILTER(WHERE priority IN ('Crítico','Alto'))::int critical,count(*) FILTER(WHERE needs_review=1)::int pending_review FROM surveys s WHERE ${where}`,
      ...args,
    ),
    get(
      `SELECT round(avg(sr.score)::numeric,2) satisfaction,count(*) FILTER(WHERE sr.score IS NOT NULL)::int ratings FROM surveys s JOIN service_ratings sr ON sr.survey_id=s.id WHERE ${where}`,
      ...args,
    ),
    get(
      `SELECT count(*) FILTER(WHERE status IN ('Resuelto','Cerrado'))::int resolved,count(*) FILTER(WHERE due_at<CURRENT_TIMESTAMP AND status NOT IN ('Resuelto','Cerrado','Error'))::int overdue,count(*) FILTER(WHERE due_at>=CURRENT_TIMESTAMP AND due_at<=CURRENT_TIMESTAMP+INTERVAL '4 hours' AND status NOT IN ('Resuelto','Cerrado','Error'))::int at_risk,count(*) FILTER(WHERE resolution_at IS NOT NULL AND (due_at IS NULL OR resolution_at<=due_at))::int within_sla,round(avg(EXTRACT(EPOCH FROM(resolution_at-created_at))/3600) FILTER(WHERE resolution_at IS NOT NULL)::numeric,1) avg_resolution_hours FROM surveys s WHERE ${where}`,
      ...args,
    ),
    get(
      `SELECT count(*)::int total,count(*) FILTER(WHERE status='Verificada')::int verified,count(*) FILTER(WHERE status IN ('Pendiente','En ejecución') AND due_at<CURRENT_TIMESTAMP)::int overdue,count(*) FILTER(WHERE financial_status='Validado')::int financially_validated,COALESCE(sum(actual_savings) FILTER(WHERE financial_status='Validado'),0)::numeric savings FROM action_plans ap WHERE ap.created_at>=?::date AND ap.created_at<?::date + INTERVAL '1 day'`,
      from,
      to,
    ),
    get(
      `SELECT count(*)::int contacted,count(*) FILTER(WHERE recovered=1)::int recovered,round(avg(satisfaction_after)::numeric,1) satisfaction_after FROM guest_recovery gr WHERE gr.created_at>=?::date AND gr.created_at<?::date + INTERVAL '1 day'`,
      from,
      to,
    ),
    query(
      `SELECT to_char(date_trunc('month',s.created_at),'YYYY-MM') label,count(DISTINCT s.id)::int total,count(DISTINCT s.id) FILTER(WHERE category IN ('Queja','Mixta'))::int complaints,round(avg(sr.score)::numeric,2) satisfaction FROM surveys s LEFT JOIN service_ratings sr ON sr.survey_id=s.id WHERE ${where} GROUP BY date_trunc('month',s.created_at) ORDER BY date_trunc('month',s.created_at)`,
      ...args,
    ),
    query(
      `SELECT a.name label,count(DISTINCT s.id)::int total,count(DISTINCT s.id) FILTER(WHERE s.category IN ('Queja','Mixta'))::int complaints,count(DISTINCT s.id) FILTER(WHERE s.status IN ('Resuelto','Cerrado'))::int resolved FROM surveys s JOIN survey_areas sa ON sa.survey_id=s.id JOIN areas a ON a.id=sa.area_id WHERE ${where} GROUP BY a.id,a.name ORDER BY complaints DESC,total DESC LIMIT 10`,
      ...args,
    ),
    query(
      `SELECT COALESCE(s.hotel,s.restaurant,s.origin_place,'Sin especificar') label,count(DISTINCT s.id)::int total,count(DISTINCT s.id) FILTER(WHERE s.category IN ('Queja','Mixta'))::int complaints,round(avg(sr.score)::numeric,2) satisfaction FROM surveys s LEFT JOIN service_ratings sr ON sr.survey_id=s.id WHERE ${where} GROUP BY COALESCE(s.hotel,s.restaurant,s.origin_place,'Sin especificar') ORDER BY satisfaction DESC NULLS LAST,total DESC LIMIT 10`,
      ...args,
    ),
    query(
      `SELECT primary_topic label,count(*)::int value FROM surveys s WHERE ${where} AND primary_topic<>'' GROUP BY primary_topic ORDER BY value DESC LIMIT 6`,
      ...args,
    ),
    query(
      `SELECT sr.service_name label,count(*) FILTER(WHERE sr.negative=1)::int negatives,round(avg(sr.score)::numeric,2) score FROM surveys s JOIN service_ratings sr ON sr.survey_id=s.id WHERE ${where} GROUP BY sr.service_name HAVING count(*)>0 ORDER BY negatives DESC,score ASC LIMIT 8`,
      ...args,
    ),
    get(
      `SELECT count(*)::int reviewed,count(*) FILTER(WHERE category_match=1 AND priority_match=1)::int exact,COALESCE(sum(fields_corrected),0)::int fields_corrected FROM ai_evaluations ae JOIN surveys s ON s.id=ae.survey_id WHERE ${where}`,
      ...args,
    ),
    get(
      `SELECT count(*) FILTER(WHERE created_at>?::date-INTERVAL '7 days' AND created_at<=?::date+INTERVAL '1 day' AND category IN ('Queja','Mixta'))::int recent_complaints,count(*) FILTER(WHERE created_at>?::date-INTERVAL '14 days' AND created_at<=?::date-INTERVAL '7 days' AND category IN ('Queja','Mixta'))::int previous_complaints FROM surveys`,
      to,
      to,
      to,
      to,
    ),
    query(
      `SELECT to_char(m.month,'YYYY-MM') label,(SELECT count(*)::int FROM surveys s2 WHERE s2.created_at>=m.month AND s2.created_at<m.month+INTERVAL '1 month') total,(SELECT count(*)::int FROM surveys s2 WHERE s2.created_at>=m.month AND s2.created_at<m.month+INTERVAL '1 month' AND s2.category IN ('Queja','Mixta')) complaints,(SELECT round(avg(sr.score)::numeric,2) FROM surveys s2 JOIN service_ratings sr ON sr.survey_id=s2.id WHERE s2.created_at>=m.month AND s2.created_at<m.month+INTERVAL '1 month') satisfaction FROM generate_series(date_trunc('month',?::date)-INTERVAL '11 months',date_trunc('month',?::date),INTERVAL '1 month') AS m(month) ORDER BY m.month`,
      to,
      to,
    ),
  ]);
  const total = Number(summary?.total || 0),
    resolved = Number(operations?.resolved || 0);
  const kpis = {
    total,
    satisfaction: Number(quality?.satisfaction || 0),
    complaintRate: total
      ? Math.round((Number(summary.complaints || 0) / total) * 100)
      : 0,
    resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
    slaRate: resolved
      ? Math.round((Number(operations?.within_sla || 0) / resolved) * 100)
      : 0,
    recoveryRate: Number(recovery?.contacted || 0)
      ? Math.round(
          (Number(recovery.recovered || 0) / Number(recovery.contacted)) * 100,
        )
      : 0,
    actionRate: Number(actions?.total || 0)
      ? Math.round(
          (Number(actions.verified || 0) / Number(actions.total)) * 100,
        )
      : 0,
  };
  const alerts = [];
  const forecast = linearForecast(
    history.map((x) => Number(x.complaints || 0)),
  );
  if (kpis.complaintRate >= 30)
    alerts.push({
      level: "danger",
      title: "Proporción alta de quejas",
      message: `${kpis.complaintRate}% de las encuestas del período son quejas o mixtas.`,
    });
  if (Number(operations?.overdue || 0) > 0)
    alerts.push({
      level: "danger",
      title: "SLA vencido",
      message: `${operations.overdue} casos abiertos superaron su fecha límite.`,
    });
  if (Number(operations?.at_risk || 0) > 0)
    alerts.push({
      level: "warning",
      title: "Riesgo próximo de incumplimiento",
      message: `${operations.at_risk} casos vencerán en las próximas 4 horas si no se atienden.`,
    });
  if (
    Number(riskTrend?.recent_complaints || 0) >
      Number(riskTrend?.previous_complaints || 0) * 1.25 &&
    Number(riskTrend?.recent_complaints || 0) >= 3
  )
    alerts.push({
      level: "warning",
      title: "Tendencia creciente de quejas",
      message: `Las quejas de los últimos 7 días subieron de ${riskTrend.previous_complaints} a ${riskTrend.recent_complaints}.`,
    });
  if (
    forecast.predicted > Number(history.at(-1)?.complaints || 0) * 1.15 &&
    forecast.predicted >= 3
  )
    alerts.push({
      level: "warning",
      title: "Pronóstico de aumento de quejas",
      message: `La tendencia de 12 meses proyecta aproximadamente ${forecast.predicted} quejas para el próximo mes (confianza ${forecast.confidence}).`,
    });
  if (Number(actions?.overdue || 0) > 0)
    alerts.push({
      level: "warning",
      title: "Planes de acción vencidos",
      message: `${actions.overdue} acciones requieren seguimiento gerencial.`,
    });
  if (kpis.satisfaction > 0 && kpis.satisfaction < 4)
    alerts.push({
      level: "warning",
      title: "Satisfacción por debajo de 4/5",
      message: `El promedio actual es ${kpis.satisfaction}/5.`,
    });
  const recommendations = [];
  if (services[0])
    recommendations.push(
      `Priorizar ${services[0].label}: registra ${services[0].negatives} calificaciones negativas.`,
    );
  if (topics[0])
    recommendations.push(
      `Crear un plan preventivo para “${topics[0].label}”, el tema más frecuente del período.`,
    );
  if (Number(operations?.overdue || 0))
    recommendations.push(
      `Reasignar y escalar los ${operations.overdue} casos con SLA vencido.`,
    );
  if (
    Number(recovery?.contacted || 0) === 0 &&
    Number(summary?.complaints || 0) > 0
  )
    recommendations.push(
      "Activar recuperación del huésped para las quejas con datos de contacto.",
    );
  if (!recommendations.length)
    recommendations.push(
      "Mantener el seguimiento semanal y documentar las prácticas de las áreas mejor evaluadas.",
    );
  return {
    from,
    to,
    generatedAt: new Date().toISOString(),
    summary,
    quality,
    operations,
    actions,
    recovery,
    trend,
    areas,
    venues,
    topics,
    services,
    aiQuality,
    riskTrend,
    history,
    forecast,
    kpis,
    alerts,
    recommendations,
  };
}

function linearForecast(values) {
  const n = values.length;
  if (n < 3)
    return {
      predicted: 0,
      slope: 0,
      confidence: "baja",
      method: "regresión lineal",
    };
  const meanX = (n - 1) / 2,
    meanY = values.reduce((a, b) => a + b, 0) / n;
  let numerator = 0,
    denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (values[i] - meanY);
    denominator += (i - meanX) ** 2;
  }
  const slope = denominator ? numerator / denominator : 0,
    predicted = Math.max(0, Math.round(meanY + slope * ((n + 1) / 2)));
  const residual = values.reduce(
      (sum, value, i) => sum + (value - (meanY + slope * (i - meanX))) ** 2,
      0,
    ),
    variance = values.reduce((sum, value) => sum + (value - meanY) ** 2, 0),
    r2 = variance ? Math.max(0, 1 - residual / variance) : 0;
  return {
    predicted,
    slope: Number(slope.toFixed(2)),
    confidence: r2 >= 0.65 ? "alta" : r2 >= 0.35 ? "media" : "baja",
    r2: Number(r2.toFixed(2)),
    method: "regresión lineal sobre 12 meses",
  };
}
