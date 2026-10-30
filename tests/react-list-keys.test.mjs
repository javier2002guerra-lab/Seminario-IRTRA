import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("las listas dinámicas de filtros y SLA tienen claves React estables", () => {
  const surveys = readSource("app/encuestas/page.js");
  const areas = readSource("app/areas/area-form.js");

  assert.match(surveys, /<option key=\{x\.id\} value=\{x\.id\}>/);
  assert.match(
    surveys,
    /<option key=\{x\.service_name\} value=\{x\.service_name\}>/,
  );
  assert.equal(
    (surveys.match(/<option key=\{x\} value=\{x\}>/g) || []).length,
    3,
  );
  assert.match(
    areas,
    /\["info", 120\],[\s\S]*?\.map\(\(\[n, v\]\) => \(\s*<input\s+key=\{n\}/,
  );
});
