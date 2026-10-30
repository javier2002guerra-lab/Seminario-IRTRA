// Isolated test host for the actual production build; no external schedulers.
import fs from "node:fs";
import https from "node:https";
import next from "next";
if (process.env.QA_ONLY !== "true" || new URL(process.env.DATABASE_URL).pathname !== "/irtra_qa")
  throw new Error("Este servidor solo admite la base de pruebas.");
const app = next({ dev: false });
await app.prepare();
const handler = app.getRequestHandler();
https.createServer({
  key: fs.readFileSync(process.env.HTTPS_KEY_PATH),
  cert: fs.readFileSync(process.env.HTTPS_CERT_PATH), minVersion: "TLSv1.2",
}, (req, res) => {
  req.headers["x-irtra-remote-address"] = req.socket.remoteAddress || "";
  return handler(req, res);
}).listen(3444, "127.0.0.1", () => console.log("Compilación de producción bajo prueba: https://localhost:3444 (datos sintéticos, sin antivirus real ni IA externa)."));
