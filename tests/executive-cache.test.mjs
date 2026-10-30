import test, { after } from "node:test";
import assert from "node:assert/strict";
import { executiveData } from "../lib/executive.js";
import { cache, invalidateExecutive } from "../lib/cache.js";
import { closeDatabase } from "../lib/db.js";

after(() => closeDatabase());

const range = { from: "2099-01-01", to: "2099-01-31" };

test("el tablero ejecutivo usa cache-aside: la segunda carga es un hit", async () => {
  await invalidateExecutive(); // parte de un estado limpio para este período
  const before = { ...cache.metrics };
  const first = await executiveData(range);
  const second = await executiveData(range);
  assert.ok(first && typeof first === "object");
  assert.equal(
    cache.metrics.misses - before.misses,
    1,
    "solo un miss: la primera carga calcula y la segunda sirve de caché",
  );
  assert.equal(cache.metrics.hits - before.hits, 1, "la segunda carga es un hit");
  assert.equal(first.generatedAt, second.generatedAt, "el hit devuelve el dato cacheado");
});

test("invalidateExecutive fuerza recalcular tras una escritura", async () => {
  await executiveData(range); // asegura una entrada cacheada
  const before = { ...cache.metrics };
  await invalidateExecutive();
  await executiveData(range);
  assert.equal(
    cache.metrics.misses - before.misses,
    1,
    "tras invalidar, la siguiente carga vuelve a calcular (miss)",
  );
});
