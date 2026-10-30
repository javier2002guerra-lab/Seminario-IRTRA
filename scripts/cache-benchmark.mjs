// Evidencia de rendimiento del Aporte 1 (Caché).
//
// Mide la latencia del tablero ejecutivo con la caché desactivada (cada carga
// golpea PostgreSQL) frente a la caché activada (la primera carga calcula y las
// siguientes se sirven de memoria), e informa la mejora. Guarda el resultado en
// auditoria/evidencias/CACHE_BENCHMARK.json.
//
// Uso: node --env-file=.env.qa.local scripts/cache-benchmark.mjs

import fs from "node:fs";
import path from "node:path";
import { executiveData } from "../lib/executive.js";
import { cache, invalidateExecutive } from "../lib/cache.js";
import { closeDatabase } from "../lib/db.js";

const N = Number(process.env.BENCH_N) || 25;
const range = { from: "2026-01-01", to: "2026-12-31" };

async function timeRuns(label) {
  const samples = [];
  for (let i = 0; i < N; i++) {
    const start = process.hrtime.bigint();
    await executiveData(range);
    samples.push(Number(process.hrtime.bigint() - start) / 1e6); // ms
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  return { label, runs: N, avgMs: Number(avg.toFixed(2)), p95Ms: Number(p95.toFixed(2)), minMs: Number(sorted[0].toFixed(2)), maxMs: Number(sorted.at(-1).toFixed(2)) };
}

// Sin caché: cada carga recalcula en la base de datos.
process.env.CACHE_ENABLED = "false";
await executiveData(range); // calentamiento de conexiones/plan
const uncached = await timeRuns("sin_cache");

// Con caché: primera carga miss, siguientes hit.
process.env.CACHE_ENABLED = "true";
await invalidateExecutive();
const cached = await timeRuns("con_cache");

const speedup = Number((uncached.avgMs / cached.avgMs).toFixed(1));
const report = {
  generatedAt: new Date().toISOString(),
  period: range,
  runsPerScenario: N,
  uncached,
  cached,
  speedupAvg: speedup,
  cacheStats: cache.stats(),
  conclusion: `Con caché, la carga promedio del tablero es ~${speedup}x más rápida (${uncached.avgMs} ms -> ${cached.avgMs} ms).`,
};

fs.mkdirSync(path.join("auditoria", "evidencias"), { recursive: true });
fs.writeFileSync(
  path.join("auditoria", "evidencias", "CACHE_BENCHMARK.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await closeDatabase();
