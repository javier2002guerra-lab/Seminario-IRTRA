import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ATLAS_KNOWLEDGE, screenName } from "../lib/atlas-knowledge.js";
import { responseSchema, systemInstructions } from "../lib/atlas-prompt.js";

// Text written in the guide that is not a literal string in the interface
// (instructions for third-party apps, examples or descriptions).
const NOT_IN_UI = new Set([
  "+",
  "Ingresar una clave de configuración",
  "Basada en el tiempo",
  "Agregar",
  "Otra cuenta",
  "O escriba el código manualmente",
  "Finalizar",
  "Guardar como PDF",
  "INFORME GERENCIAL [desde] a [hasta].xlsm",
  "REPORTE ESTADISTICO [desde] a [hasta].xlsx",
  "N documento(s) recibido(s)",
  "Toda/Todo",
  "Error de análisis…",
  "Datos al …",
  "Caso #",
  "No.",
  "6. Califique…",
  "Gestión",
  "Sin dato",
  "pts",
  "pp",
]);

function sourceText() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(entry.name) && !entry.name.startsWith("atlas-")) files.push(full);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  files.push("proxy.js");
  // Normalize JSX whitespace so multi-line text still matches.
  return files.map((file) => fs.readFileSync(file, "utf8")).join("\n").replace(/\s+/g, " ");
}

test("every quoted interface name in the ATLAS guide exists in the code", () => {
  const source = sourceText();
  const quoted = [...ATLAS_KNOWLEDGE.matchAll(/"([^"\n]{1,160})"/g)].map((m) => m[1]);
  assert.ok(quoted.length > 150, "the guide should quote the real interface");
  const missing = [...new Set(quoted)].filter((text) => {
    if (NOT_IN_UI.has(text)) return false;
    // Messages ending in "." may be split from their final period in code.
    return !source.includes(text) && !source.includes(text.replace(/\.$/, ""));
  });
  assert.deepEqual(missing, [], `Texts not found in the interface: ${missing.join(" | ")}`);
});

test("the guide covers every menu entry", () => {
  const shell = fs.readFileSync("components/Shell.js", "utf8");
  const labels = [...shell.matchAll(/\["\/[^"]*", "[^"]+", "([^"]+)"\]/g)].map((m) => m[1]);
  assert.equal(labels.length, 12);
  for (const label of labels) assert.ok(ATLAS_KNOWLEDGE.includes(`"${label}"`), label);
});

test("screen names resolve from the browser path", () => {
  assert.equal(screenName("/"), "Inicio · Centro ejecutivo de experiencia");
  assert.equal(screenName("/encuestas/15"), "Detalle de una encuesta");
  assert.equal(screenName("/encuestas?q=x"), "Buscar encuestas · Encuestas procesadas");
  assert.equal(screenName("/reportes/ejecutivo"), "Informe ejecutivo de experiencia (versión imprimible)");
  assert.equal(screenName("/no-existe"), null);
  assert.equal(screenName(undefined), null);
});

const data = {
  from: "2026-10-01", to: "2026-10-30", generatedAt: new Date().toISOString(),
  kpis: { total: 3, satisfaction: 4.2, complaintRate: 33, resolutionRate: 10, slaRate: 50, recoveryRate: 0, actionRate: 0 },
  operations: { overdue: 1, at_risk: 0 }, summary: { pending_review: 2 },
  services: [{ label: "Calidad de comida", negatives: 1 }], areas: [], topics: [], alerts: [{ title: "SLA vencido" }],
};

test("instructions include role, screen, data and the guide", () => {
  const text = systemInstructions({ name: "Ana", role: "verificador" }, data, { screen: "Reportes", areas: ["Restaurantes"] });
  assert.match(text, /Rol: Verificador/);
  assert.match(text, /Pantalla abierta ahora: Reportes/);
  assert.match(text, /Áreas autorizadas: Restaurantes/);
  assert.match(text, /Calidad de comida \(1 negativas\)/);
  assert.ok(text.includes(ATLAS_KNOWLEDGE));
  const admin = systemInstructions({ name: "Root", role: "admin" }, data);
  assert.match(admin, /Rol: Administrador/);
  assert.match(admin, /Pantalla abierta ahora: desconocida/);
});

test("action plans are limited to the user's areas", () => {
  const schema = responseSchema(["Restaurantes"]);
  assert.deepEqual(schema.properties.action_plan.anyOf[0].properties.area.enum, ["Restaurantes"]);
  assert.deepEqual(responseSchema([]).properties.action_plan, { type: "null" });
});
