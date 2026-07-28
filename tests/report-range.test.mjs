import test from "node:test";
import assert from "node:assert/strict";
import { parseExportRange, parseMonth, previousMonth } from "../lib/report-range.js";

test("acepta exportaciones de cualquier intervalo de fechas", () => {
  assert.equal(parseExportRange(new URLSearchParams("from=2026-07-01&to=2026-07-31")).days, 31);
  assert.equal(parseExportRange(new URLSearchParams("from=2026-07-16&to=2026-07-16")).days, 1);
  assert.equal(parseExportRange(new URLSearchParams("from=2020-01-01&to=2026-07-28")).days, 2401);
  assert.equal(parseExportRange(new URLSearchParams("from=2026-07-27&to=2026-07-28")).days, 2);
});
test("rechaza únicamente rangos invertidos", () => {
  assert.throws(() => parseExportRange(new URLSearchParams("from=2026-07-16&to=2026-07-01")), /anterior/);
});
test("calcula meses completos y el mes anterior", () => {
  assert.deepEqual(parseMonth("2026-02"), {value:"2026-02",from:"2026-02-01",toExclusive:"2026-03-01"});
  assert.equal(previousMonth("2026-01"), "2025-12");
});
