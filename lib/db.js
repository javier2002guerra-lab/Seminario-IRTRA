import pg from "pg";
import bcrypt from "bcryptjs";
import { AsyncLocalStorage } from "node:async_hooks";
const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://irtra:irtra_local_change@127.0.0.1:5433/irtra_calidad",
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  query_timeout: 20000,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : false,
});
const context = new AsyncLocalStorage();
function sql(text) {
  let n = 0;
  return text.replace(/\?/g, () => `$${++n}`);
}
async function exec(text, params = []) {
  const client = context.getStore() || pool;
  return client.query(sql(text), params);
}
export async function query(text, ...params) {
  const r = await exec(text, params);
  return r.rows;
}
export async function get(text, ...params) {
  const r = await exec(text, params);
  return r.rows[0];
}
export async function run(text, ...params) {
  const r = await exec(text, params);
  return { rowCount: r.rowCount, lastInsertRowid: r.rows[0]?.id };
}
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await context.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function audit({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  ip = null,
  before = null,
  after = null,
}) {
  await run(
    "INSERT INTO audit_log(user_id,action,entity_type,entity_id,ip,before_json,after_json) VALUES(?,?,?,?,?,?,?)",
    userId,
    action,
    entityType,
    String(entityId || ""),
    ip,
    JSON.stringify(before),
    JSON.stringify(after),
  );
}
export async function migrate() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS areas(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',owner TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,sla_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS surveys(id BIGSERIAL PRIMARY KEY,original_name TEXT NOT NULL,stored_name TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size BIGINT NOT NULL,sha256 TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'Recibido',category TEXT NOT NULL DEFAULT 'Sin observaciones',priority TEXT NOT NULL DEFAULT 'Informativo',priority_reason TEXT NOT NULL DEFAULT '',confidence DOUBLE PRECISION NOT NULL DEFAULT 0,summary TEXT NOT NULL DEFAULT '',primary_topic TEXT NOT NULL DEFAULT '',secondary_topics TEXT NOT NULL DEFAULT '[]',extracted_data TEXT NOT NULL DEFAULT '{}',ai_original TEXT NOT NULL DEFAULT '{}',model TEXT,prompt_version TEXT,needs_review INTEGER NOT NULL DEFAULT 1,validation_status TEXT NOT NULL DEFAULT 'Pendiente de revisión',restaurant TEXT,hotel TEXT,confirmed_by BIGINT REFERENCES users(id),confirmed_at TIMESTAMPTZ,assignee_id BIGINT REFERENCES users(id),resolution_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS survey_files(survey_id BIGINT PRIMARY KEY REFERENCES surveys(id) ON DELETE CASCADE,content BYTEA NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS survey_areas(survey_id BIGINT NOT NULL REFERENCES surveys(id),area_id BIGINT NOT NULL REFERENCES areas(id),PRIMARY KEY(survey_id,area_id));
CREATE TABLE IF NOT EXISTS corrections(id BIGSERIAL PRIMARY KEY,survey_id BIGINT NOT NULL REFERENCES surveys(id),user_id BIGINT NOT NULL REFERENCES users(id),field TEXT NOT NULL,original_value TEXT,previous_value TEXT,new_value TEXT,reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS followups(id BIGSERIAL PRIMARY KEY,survey_id BIGINT NOT NULL REFERENCES surveys(id),user_id BIGINT NOT NULL REFERENCES users(id),comment TEXT NOT NULL,status TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_areas(user_id BIGINT NOT NULL REFERENCES users(id),area_id BIGINT NOT NULL REFERENCES areas(id),PRIMARY KEY(user_id,area_id));
CREATE TABLE IF NOT EXISTS service_ratings(id BIGSERIAL PRIMARY KEY,survey_id BIGINT NOT NULL REFERENCES surveys(id),service_name TEXT NOT NULL,rating TEXT NOT NULL,score DOUBLE PRECISION,negative INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_by BIGINT REFERENCES users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_log(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id),action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,ip TEXT,before_json TEXT,after_json TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,blocked_until TIMESTAMPTZ,last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,survey_id BIGINT REFERENCES surveys(id) ON DELETE CASCADE,type TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,survey_id,type));
CREATE TABLE IF NOT EXISTS deletion_requests(id BIGSERIAL PRIMARY KEY,survey_id BIGINT NOT NULL,requested_by BIGINT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pendiente',requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,decided_by BIGINT REFERENCES users(id),decision_reason TEXT,decided_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS action_plans(id BIGSERIAL PRIMARY KEY,survey_id BIGINT REFERENCES surveys(id) ON DELETE SET NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL,owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,priority TEXT NOT NULL DEFAULT 'Medio',status TEXT NOT NULL DEFAULT 'Pendiente',due_at TIMESTAMPTZ,expected_impact TEXT NOT NULL DEFAULT '',estimated_savings NUMERIC(14,2) NOT NULL DEFAULT 0,evidence TEXT NOT NULL DEFAULT '',result TEXT NOT NULL DEFAULT '',created_by BIGINT NOT NULL REFERENCES users(id),verified_by BIGINT REFERENCES users(id),verified_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS guest_recovery(id BIGSERIAL PRIMARY KEY,survey_id BIGINT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,contact_channel TEXT NOT NULL,contact_summary TEXT NOT NULL,response_template TEXT NOT NULL DEFAULT '',commitment TEXT NOT NULL DEFAULT '',follow_up_at TIMESTAMPTZ,status TEXT NOT NULL DEFAULT 'Pendiente',satisfaction_after INTEGER,recovered INTEGER NOT NULL DEFAULT 0,created_by BIGINT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ai_evaluations(id BIGSERIAL PRIMARY KEY,survey_id BIGINT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,evaluation_type TEXT NOT NULL DEFAULT 'validacion',model TEXT,confidence_before DOUBLE PRECISION,category_match INTEGER,priority_match INTEGER,fields_corrected INTEGER NOT NULL DEFAULT 0,reviewed_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS report_schedules(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,cadence TEXT NOT NULL DEFAULT 'Semanal',day_of_week INTEGER NOT NULL DEFAULT 1,day_of_month INTEGER NOT NULL DEFAULT 1,hour_local INTEGER NOT NULL DEFAULT 8,recipients TEXT NOT NULL DEFAULT '',channels_json TEXT NOT NULL DEFAULT '["email"]',active INTEGER NOT NULL DEFAULT 1,last_sent_at TIMESTAMPTZ,next_run_at TIMESTAMPTZ,created_by BIGINT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS delivery_log(id BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,channel TEXT NOT NULL,recipient TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,error TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS deletion_request_pending_idx ON deletion_requests(survey_id) WHERE status='Pendiente';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'Pendiente de revisión';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS restaurant TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS hotel TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS origin_place TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS confirmed_by BIGINT REFERENCES users(id);
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS actual_savings NUMERIC(14,2);
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS financial_status TEXT NOT NULL DEFAULT 'Sin validar';
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS financial_note TEXT NOT NULL DEFAULT '';
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS financial_validated_by BIGINT REFERENCES users(id);
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS financial_validated_at TIMESTAMPTZ;
UPDATE users SET role=CASE WHEN role IN ('superusuario','administrador_tecnologias','admin') THEN 'admin' ELSE 'verificador' END WHERE role NOT IN ('admin','verificador');
UPDATE users SET name='Administrador IRTRA' WHERE name='Superusuario IRTRA';
CREATE INDEX IF NOT EXISTS surveys_due_open_idx ON surveys(due_at) WHERE status NOT IN ('Resuelto','Cerrado','Error');
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id,read_at,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS action_plans_status_due_idx ON action_plans(status,due_at);
CREATE INDEX IF NOT EXISTS action_plans_owner_idx ON action_plans(owner_id,status);
CREATE INDEX IF NOT EXISTS guest_recovery_survey_idx ON guest_recovery(survey_id,created_at DESC);
CREATE INDEX IF NOT EXISTS report_schedules_due_idx ON report_schedules(active,next_run_at);
CREATE INDEX IF NOT EXISTS delivery_log_created_idx ON delivery_log(created_at DESC);
UPDATE surveys SET sla_hours=CASE priority WHEN 'Crítico' THEN 1 WHEN 'Alto' THEN 4 WHEN 'Medio' THEN 24 WHEN 'Bajo' THEN 72 ELSE 120 END,due_at=created_at+(CASE priority WHEN 'Crítico' THEN 1 WHEN 'Alto' THEN 4 WHEN 'Medio' THEN 24 WHEN 'Bajo' THEN 72 ELSE 120 END * INTERVAL '1 hour') WHERE due_at IS NULL AND status NOT IN ('Resuelto','Cerrado','Error');
UPDATE surveys SET needs_review=0,status=CASE WHEN status IN ('Recibido','En procesamiento','Pendiente de revisión') THEN 'Procesado' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE validation_status='Confirmada' AND (needs_review<>0 OR status IN ('Recibido','En procesamiento','Pendiente de revisión'));
CREATE OR REPLACE FUNCTION prevent_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit log is immutable'; END $$;
DROP TRIGGER IF EXISTS audit_no_update ON audit_log; CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_change();
DROP TRIGGER IF EXISTS audit_no_delete ON audit_log; CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION prevent_audit_change();
`);
  for (const [key, value] of [
    ["retention_days", "365"],
    ["confidence_threshold", "0.85"],
    ["prompt_version", "2.1.0"],
    ["pii_masking", "true"],
  ])
    await pool.query(
      "INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
      [key, value],
    );
  await pool.query(
    "UPDATE app_settings SET value='0.85',updated_at=CURRENT_TIMESTAMP WHERE key='confidence_threshold' AND value='0.75'",
  );
  const areaCount = (await pool.query("SELECT count(*)::int count FROM areas"))
    .rows[0].count;
  if (!areaCount)
    for (const name of [
      "Sin especificar",
      "Recepción",
      "Habitaciones",
      "Restaurantes",
      "Seguridad",
      "Mantenimiento",
      "Eventos",
      "Tecnología",
    ])
      await pool.query(
        "INSERT INTO areas(name,description,sla_json) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING",
        [
          name,
          `Gestión de casos de ${name}`,
          JSON.stringify({
            Crítico: 1,
            Alto: 4,
            Medio: 24,
            Bajo: 72,
            Informativo: 120,
          }),
        ],
      );
  const userCount = (await pool.query("SELECT count(*)::int count FROM users"))
    .rows[0].count;
  if (!userCount)
    await pool.query(
      "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)",
      [
        "Superusuario IRTRA",
        process.env.SUPERUSER_EMAIL || "admin@irtra.local",
        bcrypt.hashSync(
          process.env.SUPERUSER_PASSWORD || "Cambiar-Ahora-2026!",
          12,
        ),
        "admin",
      ],
    );
}
export async function closeDatabase() {
  await pool.end();
}
