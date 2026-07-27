import fs from "node:fs";
import path from "node:path";
import { ingestSurvey } from "./ingest.js";

const MIME = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
function uniqueTarget(dir, name) {
  const parsed = path.parse(name);
  let target = path.join(dir, name), n = 1;
  while (fs.existsSync(target)) target = path.join(dir, `${parsed.name}-${n++}${parsed.ext}`);
  return target;
}
export function startScannerWatcher() {
  if (process.env.SCAN_WATCH_ENABLED !== "true") return null;
  const inbox = path.resolve(process.env.SCAN_WATCH_DIR || "scanner_inbox");
  const archive = path.resolve(process.env.SCAN_ARCHIVE_DIR || path.join(inbox, "procesados"));
  const failed = path.resolve(process.env.SCAN_FAILED_DIR || path.join(inbox, "fallidos"));
  const pollMs = Math.max(2000, Number(process.env.SCAN_POLL_MS || 5000));
  const settleMs = Math.max(1000, Number(process.env.SCAN_SETTLE_MS || 2500));
  for (const dir of [inbox, archive, failed]) fs.mkdirSync(dir, { recursive: true });
  const busy = new Set();
  async function scan() {
    for (const entry of fs.readdirSync(inbox, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const source = path.join(inbox, entry.name), ext = path.extname(entry.name).toLowerCase();
      if (!MIME[ext] || busy.has(source) || Date.now() - fs.statSync(source).mtimeMs < settleMs) continue;
      busy.add(source);
      try {
        await ingestSurvey({ name: entry.name, type: MIME[ext], buffer: fs.readFileSync(source), source: "scanner" });
        fs.renameSync(source, uniqueTarget(archive, entry.name));
        console.log(`[Escáner] Importado: ${entry.name}`);
      } catch (error) {
        const target = String(error.message).includes("duplicado") ? archive : failed;
        fs.renameSync(source, uniqueTarget(target, entry.name));
        console.error(`[Escáner] ${entry.name}: ${error.message}`);
      } finally { busy.delete(source); }
    }
  }
  const timer = setInterval(() => scan().catch((e) => console.error("[Escáner]", e)), pollMs);
  timer.unref();
  scan().catch((e) => console.error("[Escáner]", e));
  console.log(`[Escáner] Vigilando ${inbox}`);
  return timer;
}
