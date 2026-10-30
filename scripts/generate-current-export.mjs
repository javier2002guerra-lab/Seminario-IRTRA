import { closeDatabase } from "../lib/db.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { verifyManagerialTemplate } from "../lib/excel-template.js";
import { managerialExportRows } from "../lib/managerial-export.js";

const root = process.cwd();
const output = path.resolve(process.argv[2] || "INFORME GERENCIAL - DATOS ACTUALES.xlsm");
const payload = await managerialExportRows();
const temporary = path.join(os.tmpdir(), `irtra-audit-${crypto.randomUUID()}.json`);
try {
  const template = path.join(root, "data", "excel_templates", "INFORME GERENCIAL ENCUESTAS.xlsm");
  verifyManagerialTemplate(template);
  fs.writeFileSync(temporary, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  const python = process.env.PYTHON_COMMAND || "python";
  const result = spawnSync(
    python,
    [path.join(root, "scripts", "fill-managerial-template.py"),
      template,
      temporary, output],
    { cwd: root, encoding: "utf8", timeout: 180000, windowsHide: true },
  );
  if (result.status !== 0 || !fs.existsSync(output))
    throw new Error(String(result.stderr || result.stdout || "No se generó el archivo.").slice(0, 2000));
  console.log(`EXPORT_OK records=${payload.length} ratings=${payload.reduce((total,row)=>total+row.ratings.length,0)} output=${output}`);
} finally {
  try { fs.unlinkSync(temporary); } catch {}
  await closeDatabase();
}
