import { defineConfig } from "cypress";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { get, query, run, transaction, closeDatabase } from "./lib/db.js";
import { decryptMfaSecret, totpAt } from "./lib/mfa.js";
import { saveOriginal } from "./lib/files.js";
import sharp from "sharp";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

function guard() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  if (process.env.QA_ONLY !== "true" || url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/irtra_qa")
    throw new Error("Cypress requiere la base sintética exclusiva; ejecute npm run qa:cypress.");
}
guard();
let auditBaseline = 0;
export default defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  viewportWidth: 1366, viewportHeight: 900,
  defaultCommandTimeout: 15000, requestTimeout: 30000, responseTimeout: 120000,
  e2e: {
    baseUrl: "https://localhost:3444", testIsolation: true,
    specPattern: "cypress/e2e/**/*.cy.js", supportFile: "cypress/support/e2e.js",
    async setupNodeEvents(on, config) {
      on("task", {
        async resetQa() {
          guard();
          auditBaseline = Number((await get("SELECT COALESCE(max(id),0) id FROM audit_log")).id);
          // Named tasks only: no arbitrary SQL or production reset capability.
          await transaction(async () => {
            await run("TRUNCATE surveys,login_attempts,request_limits RESTART IDENTITY CASCADE");
            await run("UPDATE users SET mfa_enabled=0,mfa_secret=NULL,mfa_pending_secret=NULL,mfa_last_counter=NULL,recovery_codes='[]',must_change_password=0,session_version=session_version+1 WHERE email IN (?,?)", process.env.SUPERUSER_EMAIL, "verificador@qa.local");
          });
          return null;
        },
        async credentials(options) {
          if (options?.verifier) {
            let user = await get("SELECT id FROM users WHERE email='verificador@qa.local'");
            if (!user) {
              const inserted = await run("INSERT INTO users(name,email,password_hash,role) VALUES('Verificador QA','verificador@qa.local',?,'verificador') RETURNING id", await bcrypt.hash(process.env.SUPERUSER_PASSWORD, 12));
              user = { id: inserted.lastInsertRowid };
            }
            await run("INSERT INTO user_areas(user_id,area_id) SELECT ?,id FROM areas WHERE name='Recepción' ON CONFLICT DO NOTHING", user.id);
          }
          return { email: options?.verifier ? "verificador@qa.local" : process.env.SUPERUSER_EMAIL, password: process.env.SUPERUSER_PASSWORD };
        },
        async otp(options) {
          const user = await get("SELECT mfa_pending_secret,mfa_secret FROM users WHERE email=?", options?.verifier ? "verificador@qa.local" : process.env.SUPERUSER_EMAIL);
          return totpAt(decryptMfaSecret(user.mfa_pending_secret || user.mfa_secret));
        },
        async seedSurvey(options) {
          const confirmed = options?.confirmed === true;
          const bytes = await sharp({ create: { width: 48, height: 48, channels: 3, background: "white" } }).png().toBuffer();
          const stored = saveOriginal(bytes, "png");
          const row = await run("INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,priority,confidence,summary,primary_topic,extracted_data,validation_status,needs_review,created_at) VALUES(?,?, 'image/png',?,?,'Pendiente de revisión','Queja','Medio',0.9,'Comida fría','Comida',?,?,?,?::timestamptz) RETURNING id",
            "qa-sintetica.png", stored, bytes.length, crypto.randomUUID(),
            JSON.stringify({ general_data: { document_number: "000018", visit_date: "15/01/2099" }, numbered_answers: { item_9: "Comida fría" } }),
            confirmed ? "Confirmada" : "Pendiente de revisión", confirmed ? 0 : 1, "2099-01-15T12:00:00Z");
          await run("INSERT INTO survey_files(survey_id,content) VALUES(?,?)", row.lastInsertRowid, bytes);
          if (options?.area) await run("INSERT INTO survey_areas(survey_id,area_id) SELECT ?,id FROM areas WHERE name=?", row.lastInsertRowid, options.area);
          return Number(row.lastInsertRowid);
        },
        async survey(id) { return (await get("SELECT id,extracted_data,restaurant,hotel,origin_place,validation_status,needs_review,status FROM surveys WHERE id=?", id)) || null; },
        async latestSurvey() { return (await get("SELECT extracted_data,confidence,needs_review,validation_status FROM surveys ORDER BY id DESC LIMIT 1")) || null; },
        async imageFixture() { return (await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: Math.floor(Math.random() * 255), g: 90, b: 140 } } }).png().toBuffer()).toString("base64"); },
        async auditActions(id) { return (await query("SELECT action FROM audit_log WHERE entity_type='survey' AND entity_id=? AND id>? ORDER BY id", String(id), auditBaseline)).map(row => row.action); },
        async areaIds() { return (await query("SELECT id FROM areas WHERE active=1 ORDER BY id LIMIT 1")).map(row => Number(row.id)); },
        async verifyDownload({ filename, statistical = false }) {
          const file = path.resolve(config.downloadsFolder, filename);
          if (path.dirname(file) !== path.resolve(config.downloadsFolder)) throw new Error("Ruta no permitida");
          const result = spawnSync(process.env.PYTHON_COMMAND, ["tests/verify-downloaded-report.py", file, statistical ? "statistical" : "managerial"], {
            encoding: "utf8", timeout: 120000, windowsHide: true,
            env: { ...process.env, PYTHONPATH: path.resolve(".python-packages") },
          });
          if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
          return JSON.parse(result.stdout);
        },
      });
      on("after:run", () => closeDatabase());
      return config;
    },
  },
});
