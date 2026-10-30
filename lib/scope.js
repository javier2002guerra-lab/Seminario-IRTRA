export function surveyScope(user, alias = "s") {
  if (user?.role === "admin") return { where: "1=1", params: [] };
  if (user?.role !== "verificador" || !Number.isSafeInteger(Number(user.id)))
    return { where: "1=0", params: [] };
  return {
    where: `(
      EXISTS (
        SELECT 1
        FROM survey_areas scope_sa
        JOIN user_areas scope_ua ON scope_ua.area_id=scope_sa.area_id
        WHERE scope_sa.survey_id=${alias}.id AND scope_ua.user_id=?
      )
      OR (
        ${alias}.created_by=?
        AND NOT EXISTS (
          SELECT 1 FROM survey_areas scope_unassigned
          WHERE scope_unassigned.survey_id=${alias}.id
        )
      )
    )`,
    params: [Number(user.id), Number(user.id)],
  };
}
import { get } from "./db.js";
import { isValidId } from "./security.js";


export async function scopedSurvey(user, id) {
  if (!isValidId(id)) return null;
  const scope = surveyScope(user, "s");
  return get(
    `SELECT s.* FROM surveys s WHERE s.id=? AND ${scope.where}`,
    Number(id),
    ...scope.params,
  );
}

export async function areasWithinScope(user, areaIds) {
  if (!Array.isArray(areaIds) || areaIds.length > 100 || areaIds.some(id => !isValidId(id))) return false;
  if (user?.role === "admin") return true;
  if (user?.role !== "verificador") return false;
  const ids = [...new Set((areaIds || []).map(Number).filter(Number.isSafeInteger))];
  if (!ids.length) return false;
  const row = await get(
    "SELECT count(*)::int n FROM user_areas WHERE user_id=? AND area_id=ANY(?::bigint[])",
    user.id,
    ids,
  );
  return Number(row?.n || 0) === ids.length;
}

export async function scopedActionPlan(user, id) {
  if (!isValidId(id)) return null;
  if (user?.role === "admin")
    return get("SELECT * FROM action_plans WHERE id=?", Number(id));
  if (user?.role !== "verificador") return null;
  const survey = surveyScope(user, "s");
  return get(
    `SELECT ap.* FROM action_plans ap
     LEFT JOIN surveys s ON s.id=ap.survey_id
     WHERE ap.id=? AND (
       (ap.survey_id IS NOT NULL AND ${survey.where})
       OR (ap.survey_id IS NULL AND EXISTS (
         SELECT 1 FROM user_areas ua
         WHERE ua.user_id=? AND ua.area_id=ap.area_id
       ))
     )`,
    Number(id),
    ...survey.params,
    user.id,
  );
}
