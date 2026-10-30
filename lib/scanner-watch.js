import fs from "node:fs";
import path from "node:path";
import { ingestSurvey } from "./ingest.js";
import {
  boundedConcurrency,
  processBoundedQueue,
} from "./bounded-queue.js";

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
  const concurrency = boundedConcurrency(process.env.SCAN_CONCURRENCY || 1);
  for (const dir of [inbox, archive, failed]) fs.mkdirSync(dir, { recursive: true });
  const busy = new Set();
  let scanning = false;
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const entries = fs
        .readdirSync(inbox, { withFileTypes: true })
        .filter((entry) => entry.isFile());
      await processBoundedQueue(
        entries,
        async (entry) => {
          const source = path.join(inbox, entry.name);
          const ext = path.extname(entry.name).toLowerCase();
          if (
            !MIME[ext] ||
            busy.has(source) ||
            !fs.existsSync(source) ||
            Date.now() - fs.statSync(source).mtimeMs < settleMs
          )
            return;
          busy.add(source);
          try {
            await ingestSurvey({
              name: entry.name,
              type: MIME[ext],
              buffer: fs.readFileSync(source),
              source: "scanner",
            });
            fs.renameSync(source, uniqueTarget(archive, entry.name));
            console.log(`[Escáner] Importado: ${entry.name}`);
          } catch (error) {
            const target = String(error.message).includes("duplicado")
              ? archive
              : failed;
            if (fs.existsSync(source))
              fs.renameSync(source, uniqueTarget(target, entry.name));
            console.error(`[Escáner] ${entry.name}: ${error.message}`);
          } finally {
            busy.delete(source);
          }
        },
        concurrency,
      );
    } finally {
      scanning = false;
    }
  }
  const timer = setInterval(() => scan().catch((e) => console.error("[Escáner]", e)), pollMs);
  timer.unref();
  scan().catch((e) => console.error("[Escáner]", e));
  console.log(`[Escáner] Vigilando ${inbox} (concurrencia ${concurrency})`);
  return timer;
}
