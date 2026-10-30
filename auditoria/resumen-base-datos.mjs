import { closeDatabase, query } from "../lib/db.js";

const scalar = async (sql) => Number((await query(sql))[0].n);

try {
  const summary = {
    tables: await scalar(
      "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    ),
    surveys: await scalar("SELECT count(*)::int n FROM surveys"),
    users: await scalar("SELECT count(*)::int n FROM users"),
    auditRows: await scalar("SELECT count(*)::int n FROM audit_log"),
    duplicateSurveyHashes: await scalar(
      "SELECT count(*)::int n FROM (SELECT sha256 FROM surveys GROUP BY sha256 HAVING count(*)>1) d",
    ),
    duplicateEmailsIgnoringCase: await scalar(
      "SELECT count(*)::int n FROM (SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*)>1) d",
    ),
    orphanSurveyAreas: await scalar(
      "SELECT count(*)::int n FROM survey_areas sa LEFT JOIN surveys s ON s.id=sa.survey_id LEFT JOIN areas a ON a.id=sa.area_id WHERE s.id IS NULL OR a.id IS NULL",
    ),
    databaseSize: (
      await query(
        "SELECT pg_size_pretty(pg_database_size(current_database())) size",
      )
    )[0].size,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await closeDatabase();
}
