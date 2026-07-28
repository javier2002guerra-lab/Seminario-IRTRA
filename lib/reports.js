import { get, query } from "./db.js";
function safeDate(value, fallback) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback; }
export function reportRange(params = {}) {
  return { from: safeDate(params.from, "2020-01-01"), to: safeDate(params.to, new Date().toISOString().slice(0, 10)) };
}
export async function reportStatistics(range) {
  const where = "s.status<>'Error' AND s.created_at>=?::date AND s.created_at<?::date + INTERVAL '1 day'", args = [range.from, range.to];
  const summary = await get(`SELECT count(*)::int total,count(*) FILTER (WHERE category IN ('Queja','Mixta'))::int complaints,count(*) FILTER (WHERE category IN ('Sugerencia','Mixta'))::int suggestions,count(*) FILTER (WHERE category='Felicitación')::int compliments,count(*) FILTER (WHERE validation_status<>'Confirmada')::int pending_review,count(*) FILTER (WHERE status IN ('Resuelto','Cerrado'))::int resolved FROM surveys s WHERE ${where}`,...args);
  const grouped = (sql) => query(sql,...args);
  const [categories,priorities,statuses,areas,services,venues,daily,cases] = await Promise.all([
    grouped(`SELECT category label,count(*)::int value FROM surveys s WHERE ${where} GROUP BY category ORDER BY value DESC,label`),
    grouped(`SELECT priority label,count(*)::int value FROM surveys s WHERE ${where} GROUP BY priority ORDER BY CASE priority WHEN 'Crítico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 WHEN 'Bajo' THEN 4 ELSE 5 END`),
    grouped(`SELECT CASE WHEN validation_status='Confirmada' AND status IN ('Recibido','En procesamiento','Pendiente de revisión') THEN 'Procesado' ELSE status END label,count(*)::int value FROM surveys s WHERE ${where} GROUP BY label ORDER BY value DESC,label`),
    grouped(`SELECT a.name label,count(DISTINCT s.id)::int value FROM surveys s JOIN survey_areas sa ON sa.survey_id=s.id JOIN areas a ON a.id=sa.area_id WHERE ${where} GROUP BY a.id,a.name ORDER BY value DESC,label`),
    grouped(`SELECT sr.service_name service,sr.rating,count(*)::int value FROM surveys s JOIN service_ratings sr ON sr.survey_id=s.id WHERE ${where} GROUP BY sr.service_name,sr.rating ORDER BY sr.service_name,sr.rating`),
    grouped(`SELECT COALESCE(s.origin_place,s.hotel,s.restaurant,'Sin especificar') label,count(*)::int value FROM surveys s WHERE ${where} GROUP BY COALESCE(s.origin_place,s.hotel,s.restaurant,'Sin especificar') ORDER BY value DESC,label`),
    grouped(`SELECT to_char(date(s.created_at),'YYYY-MM-DD') label,count(*)::int value FROM surveys s WHERE ${where} GROUP BY date(s.created_at) ORDER BY date(s.created_at)`),
    grouped(`SELECT s.id,s.original_name,s.created_at,s.category,s.priority,CASE WHEN s.validation_status='Confirmada' AND s.status IN ('Recibido','En procesamiento','Pendiente de revisión') THEN 'Procesado' ELSE s.status END status,s.confidence,COALESCE(s.origin_place,s.hotel,s.restaurant) origin_place,s.hotel,s.restaurant FROM surveys s WHERE ${where} ORDER BY s.created_at,s.id`),
  ]);
  if (categories.reduce((n,x)=>n+Number(x.value),0)!==Number(summary.total) || priorities.reduce((n,x)=>n+Number(x.value),0)!==Number(summary.total)) throw new Error("Las estadísticas no coinciden con el total.");
  return {range,generatedAt:new Date().toISOString(),summary,categories,priorities,statuses,areas,services,venues,daily,cases};
}
