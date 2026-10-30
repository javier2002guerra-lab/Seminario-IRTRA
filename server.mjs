import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import next from "next";
import { validateProductionSecurity } from "./lib/security.js";
import { startScannerWatcher } from "./lib/scanner-watch.js";
import { startReportScheduler } from "./lib/report-scheduler.js";
import { closeDatabase, validateDatabaseSecurity } from "./lib/db.js";
import { checkMalwareScanner } from "./lib/malware-scan.js";
validateProductionSecurity();

const remoteProduction =
  process.env.NODE_ENV === "production" &&
  !/^(localhost|127\.0\.0\.1)$/i.test(
    new URL(process.env.APP_BASE_URL).hostname,
  );
if (remoteProduction) {
  await validateDatabaseSecurity();
  await checkMalwareScanner();
}

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
await app.prepare();
startScannerWatcher();
startReportScheduler();
const host = process.env.BIND_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3443);
const externalTls =
  process.env.EXTERNAL_TLS_TERMINATION === "true" ||
  Boolean(process.env.RENDER);
const requestHandler = (req, res) => {
  // Overwrite any client-supplied value with the address observed by Node.
  req.headers["x-irtra-remote-address"] = req.socket.remoteAddress || "";
  return handle(req, res);
};
const server = externalTls
  ? http.createServer(requestHandler)
  : https.createServer(
      {
        key: fs.readFileSync(
          process.env.HTTPS_KEY_PATH || "certs/localhost-key.pem",
        ),
        cert: fs.readFileSync(
          process.env.HTTPS_CERT_PATH || "certs/localhost.pem",
        ),
        minVersion: "TLSv1.2",
      },
      requestHandler,
    );
server.requestTimeout = 120000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;
server.listen(port, host, () => {
  console.log(
    `IRTRA disponible en ${externalTls ? "http" : "https"}://${host}:${port}`,
  );
});
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: cerrando IRTRA de forma segura.`);
  server.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
