// Local, synthetic QA only. Never loads .env.local or connects to production.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import forge from "node-forge";

const root = process.cwd();
const directory = path.join(root, ".qa");
const envFile = path.join(root, ".env.qa.local");
const action = process.argv[2] || "test";
fs.mkdirSync(directory, { recursive: true });
function exec(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} terminó con código ${result.status}`);
}
if (!fs.existsSync(envFile)) {
  const python = process.env.QA_PYTHON || "python";
  exec(python, ["--version"]);
  const secret = () => crypto.randomBytes(48).toString("base64url");
  const settings = {
    NODE_ENV: "development", QA_ONLY: "true", DATABASE_URL: `postgresql://irtra_qa:${secret()}@127.0.0.1:55434/irtra_qa`,
    PGSSL_MODE: "disable", PGSSL: "false", APP_BASE_URL: "https://localhost:3444", PORT: "3444", BIND_HOST: "127.0.0.1",
    SESSION_SECRET: secret(), CSRF_SECRET: secret(), MFA_ENCRYPTION_KEY: secret(), COOKIE_SECURE: "true",
    SUPERUSER_EMAIL: "admin@irtra.local", SUPERUSER_PASSWORD: `Qa!7${secret()}`,
    PYTHON_COMMAND: python, FILE_SCAN_MODE: "signature", EXTERNAL_AI_ENABLED: "false", EXTERNAL_AI_PII_APPROVED: "false",
    SCAN_WATCH_ENABLED: "false", REPORT_SCHEDULER_ENABLED: "false", TRUST_PROXY: "false", EXTERNAL_TLS_TERMINATION: "false",
    HTTPS_KEY_PATH: path.join(directory, "localhost-key.pem"), HTTPS_CERT_PATH: path.join(directory, "localhost.pem"),
    UPLOAD_DIR: path.join(directory, "uploads"),
  };
  fs.writeFileSync(envFile, Object.entries(settings).map(([key,value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
}
// Overwrite inherited configuration too, so a caller's DB/AI variables cannot leak in.
const { parseEnv } = await import("node:util");
Object.assign(process.env, parseEnv(fs.readFileSync(envFile, "utf8")));
const url = new URL(process.env.DATABASE_URL);
if (process.env.QA_ONLY !== "true" || url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/irtra_qa")
  throw new Error("QA solo admite su base local dedicada irtra_qa:55434.");
if (process.env.EXTERNAL_AI_ENABLED !== "false" || process.env.REPORT_SCHEDULER_ENABLED !== "false")
  throw new Error("QA no permite IA externa ni envíos programados.");

if (action === "setup") {
  const bin = process.env.QA_PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const pg = name => bin ? path.join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
  const cluster = path.join(directory, "postgres");
  if (!fs.existsSync(path.join(cluster, "PG_VERSION"))) {
    const passwordFile = path.join(directory, "pg-password");
    fs.writeFileSync(passwordFile, url.password, { mode: 0o600 });
    try { exec(pg("initdb"), ["-D", cluster, "-U", "qa_bootstrap", "--encoding=UTF8", "--locale=C", "--auth-host=scram-sha-256", "--auth-local=trust", `--pwfile=${passwordFile}`]); }
    finally { fs.unlinkSync(passwordFile); }
  }
  const status = spawnSync(pg("pg_ctl"), ["-D", cluster, "status"], { windowsHide: true, stdio: "ignore" });
  if (status.status !== 0) exec(pg("pg_ctl"), ["-D", cluster, "-l", path.join(directory, "postgres.log"), "-o", "-p 55434 -h 127.0.0.1", "-w", "start"]);
  const { default: pgClient } = await import("pg");
  const client = new pgClient.Client({ host: "127.0.0.1", port: 55434, user: "qa_bootstrap", password: url.password, database: "postgres" });
  await client.connect();
  try {
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='irtra_qa'")).rowCount)
      await client.query(`CREATE ROLE irtra_qa LOGIN PASSWORD '${url.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='irtra_qa'")).rowCount)
      await client.query("CREATE DATABASE irtra_qa OWNER irtra_qa");
  } finally { await client.end(); }
  if (!fs.existsSync(process.env.HTTPS_KEY_PATH)) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = "01";
    certificate.validity.notBefore = new Date(Date.now() - 60000);
    certificate.validity.notAfter = new Date(Date.now() + 30 * 86400000);
    certificate.setSubject([{ name: "commonName", value: "localhost" }]);
    certificate.setIssuer(certificate.subject.attributes);
    certificate.setExtensions([{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }]);
    certificate.sign(keys.privateKey, forge.md.sha256.create());
    fs.writeFileSync(process.env.HTTPS_KEY_PATH, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
    fs.writeFileSync(process.env.HTTPS_CERT_PATH, forge.pki.certificateToPem(certificate));
  }
  exec(process.execPath, ["scripts/install-python-deps.mjs"]);
  exec(process.execPath, ["scripts/migrate.mjs"]);
  console.log("QA preparado en https://localhost:3444. Credenciales locales en .env.qa.local (no publicar).");
} else {
  const commands = {
    test: ["--test", "tests/*.test.mjs"], serve: ["scripts/serve-qa.mjs"],
    cypress: ["scripts/run-cypress.mjs"], build: ["node_modules/next/dist/bin/next", "build"],
    readiness: ["scripts/production-readiness.mjs"],
    queue: ["scripts/simulate-survey-queue.mjs", "--count=100", "--concurrency=8"],
    load: ["scripts/load-test.mjs"],
    playwright: ["node_modules/@playwright/test/cli.js", "test"],
    demo: ["scripts/prepare-local-demo.mjs"],
  };
  if (!commands[action]) throw new Error(`Acción QA desconocida: ${action}`);
  const child = spawn(process.execPath, commands[action], { stdio: "inherit", windowsHide: true, env: {
    ...process.env, ...(["build", "serve"].includes(action) ? { NODE_ENV: "production" } : {}),
    ...(action === "load" ? { LOAD_TEST_URL: "https://localhost:3444", LOAD_TEST_DURATION_MS: "5000", LOAD_TEST_CONCURRENCY: "10" } : {}),
    ...(action === "playwright" ? { E2E_BASE_URL: "https://localhost:3444", E2E_BROWSER_CHANNEL: "chrome" } : {}),
  } });
  child.on("exit", code => { process.exitCode = code ?? 1; });
}
