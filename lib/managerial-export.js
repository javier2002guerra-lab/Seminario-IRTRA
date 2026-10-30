import { query } from "./db.js";

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function managerialExportRow(row, ratings = []) {
  const extracted = parseJson(row.extracted_data, {});
  const general = extracted.general_data || {};
  return {
    id: row.id,
    created_at: row.created_at,
    category: row.category,
    priority: row.priority,
    primary_topic: row.primary_topic,
    secondary_topics: parseJson(row.secondary_topics, []),
    summary: row.summary,
    origin_place: row.origin_place || general.origin_place || null,
    restaurant: row.restaurant || general.restaurant || null,
    hotel: row.hotel || general.hotel || null,
    general,
    numbered: extracted.numbered_answers || {},
    negative_comments: Array.isArray(extracted.negative_comments)
      ? extracted.negative_comments
      : [],
    areas: row.areas ? row.areas.split("|").filter(Boolean) : [],
    ratings,
  };
}

export async function managerialExportRows({
  scope = { where: "1=1", params: [] },
  range = null,
} = {}) {
  const rangeSql = range
    ? " AND s.created_at>=?::date AND s.created_at<?::date + INTERVAL '1 day'"
    : "";
  const rangeParams = range ? [range.from, range.to] : [];
  const surveys = await query(
    `SELECT s.*,COALESCE(string_agg(DISTINCT a.name,'|' ORDER BY a.name),'') areas,
       COALESCE((SELECT json_agg(json_build_object(
         'survey_id',sr.survey_id::text,'service_name',sr.service_name,
         'rating',sr.rating,'score',sr.score,'negative',sr.negative) ORDER BY sr.id)
         FROM service_ratings sr WHERE sr.survey_id=s.id),'[]'::json) ratings
     FROM surveys s
     LEFT JOIN survey_areas sa ON sa.survey_id=s.id
     LEFT JOIN areas a ON a.id=sa.area_id
     WHERE ${scope.where} AND s.status<>'Error'
       AND s.validation_status='Confirmada'${rangeSql}
     GROUP BY s.id ORDER BY s.created_at,s.id`,
    ...scope.params,
    ...rangeParams,
  );
  // One PostgreSQL statement gives surveys and ratings the same MVCC snapshot,
  // even if a reviewer edits and reopens a survey during an export.
  return surveys.map((row) =>
    managerialExportRow(row, row.ratings || []),
  );
}
