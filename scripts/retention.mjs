import fs from "node:fs";
import path from "node:path";
import { get, query, run, audit, transaction } from "../lib/db.js";
const days = Number(
    (await get("SELECT value FROM app_settings WHERE key='retention_days'"))?.value ||
      365,
  ),
  cutoff = new Date(Date.now() - days * 86400000).toISOString();
const rows = await query(
  "SELECT id,stored_name FROM surveys WHERE created_at<? AND status='Cerrado'",
  cutoff,
);
await transaction(async () => {
  for (const r of rows) {
    const file = path.resolve(
      process.env.UPLOAD_DIR || "private_uploads",
      path.basename(r.stored_name),
    );
    if (fs.existsSync(file)) fs.unlinkSync(file);
    await run(
      "UPDATE surveys SET stored_name='PURGED-'||id,summary='[Información anonimizada por política de retención]',extracted_data='{}',ai_original='{}',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      r.id,
    );
    await audit({
      action: "RETENTION_PURGE",
      entityType: "survey",
      entityId: r.id,
      after: { retention_days: days },
    });
  }
});
console.log(
  `${rows.length} caso(s) anonimizado(s) según retención de ${days} días.`,
);
