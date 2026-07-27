import fs from "node:fs";
import path from "node:path";

const MIME = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const endpoint = new URL("/api/scanner/ingest", process.env.SCANNER_REMOTE_URL || "https://irtra-encuestas.onrender.com").href;
const token = process.env.SCANNER_INGEST_TOKEN || "";
const inbox = path.resolve(process.env.SCAN_WATCH_DIR || "scanner_inbox");
const archive = path.resolve(process.env.SCAN_ARCHIVE_DIR || path.join(inbox, "procesados"));
const failed = path.resolve(process.env.SCAN_FAILED_DIR || path.join(inbox, "fallidos"));
const pollMs = Math.max(2000, Number(process.env.SCAN_POLL_MS || 5000));
const settleMs = Math.max(1500, Number(process.env.SCAN_SETTLE_MS || 3000));
if (token.length < 43) throw new Error("SCANNER_INGEST_TOKEN no está configurado.");
for (const dir of [inbox, archive, failed]) fs.mkdirSync(dir, { recursive: true });

function uniqueTarget(dir, name) {
  const parsed = path.parse(name);
  let target = path.join(dir, name), n = 1;
  while (fs.existsSync(target)) target = path.join(dir, `${parsed.name}-${n++}${parsed.ext}`);
  return target;
}

async function upload(source, name, mime) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(source)], { type: mime }), name);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(120000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Respuesta ${response.status}`);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
    }
  }
  throw lastError;
}

const busy = new Set();
async function scan() {
  for (const entry of fs.readdirSync(inbox, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = path.join(inbox, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    if (!MIME[ext] || busy.has(source) || Date.now() - fs.statSync(source).mtimeMs < settleMs) continue;
    busy.add(source);
    try {
      const result = await upload(source, entry.name, MIME[ext]);
      fs.renameSync(source, uniqueTarget(archive, entry.name));
      console.log(`[Conector] ${result.duplicate ? "Duplicado reconocido" : "Encuesta cargada"}: ${entry.name}`);
    } catch (error) {
      fs.renameSync(source, uniqueTarget(failed, entry.name));
      console.error(`[Conector] Falló ${entry.name}: ${error.message}`);
    } finally {
      busy.delete(source);
    }
  }
}

console.log(`[Conector] Vigilando ${inbox}`);
console.log(`[Conector] Destino seguro ${new URL(endpoint).origin}`);
await scan();
setInterval(() => scan().catch((error) => console.error("[Conector]", error.message)), pollMs);
