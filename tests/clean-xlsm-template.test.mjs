import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  MANAGERIAL_TEMPLATE_SHA256,
  verifyManagerialTemplate,
} from "../lib/excel-template.js";

const root = process.cwd();
const template = path.join(root, "data", "excel_templates", "INFORME GERENCIAL ENCUESTAS.xlsm");

test("la descarga usa la plantilla limpia aprobada", () => {
  assert.equal(verifyManagerialTemplate(template), MANAGERIAL_TEMPLATE_SHA256);
  const python = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, [path.join(root, "scripts", "verify-clean-xlsm.py"), template], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    cached_formula_results: 0,
    numeric_constants: 0,
    nonzero_numeric_constants: 0,
    examples: [],
  });
});

test("la plantilla conserva las cuatro acciones de botones reparadas", () => {
  const python = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, [path.join(root, "scripts", "verify-xlsm-buttons.py"), template], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    expected_actions: 4,
    missing_actions: [],
  });
});

test("el endpoint y el generador manual exportan solo encuestas confirmadas", () => {
  const shared = fs.readFileSync(
    path.join(root, "lib", "managerial-export.js"),
    "utf8",
  );
  assert.match(shared, /validation_status='Confirmada'/);
  for (const file of [
    path.join(root, "app", "api", "export", "route.js"),
    path.join(root, "scripts", "generate-current-export.mjs"),
  ]) {
    assert.match(fs.readFileSync(file, "utf8"), /managerialExportRows/);
  }
});
