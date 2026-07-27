import test from "node:test";
import assert from "node:assert/strict";
import { parseExportRange, parseMonth, previousMonth } from "../lib/report-range.js";

test("acepta exportaciones de uno a 31 días", () => {
  assert.equal(parseExportRange(new URLSearchParams("from=2026-07-01&to=2026-07-31")).days, 31);
  assert.equal(parseExportRange(new URLSearchParams("from=2026-07-16&to=2026-07-16")).days, 1);
});
test("rechaza rangos mayores a un mes e invertidos", () => {
  assert.throws(() => parseExportRange(new URLSearchParams("from=2026-06-01&to=2026-07-16")), /31 días/);
  assert.throws(() => parseExportRange(new URLSearchParams("from=2026-07-16&to=2026-07-01")), /anterior/);
});
test("calcula meses completos y el mes anterior", () => {
  assert.deepEqual(parseMonth("2026-02"), {value:"2026-02",from:"2026-02-01",toExclusive:"2026-03-01"});
  assert.equal(previousMonth("2026-01"), "2025-12");
});
