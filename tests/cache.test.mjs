import test from "node:test";
import assert from "node:assert/strict";
import { Cache, MemoryStore } from "../lib/cache.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("cache-aside: primer acceso es miss y produce; el segundo es hit sin producir", async () => {
  const cache = new Cache(new MemoryStore(10), { defaultTtl: 1000 });
  let calls = 0;
  const produce = async () => (calls++, { n: 42 });
  const a = await cache.wrap("ns", "k", produce);
  const b = await cache.wrap("ns", "k", produce);
  assert.deepEqual(a, { n: 42 });
  assert.deepEqual(b, { n: 42 });
  assert.equal(calls, 1, "el productor solo se ejecuta una vez");
  assert.equal(cache.metrics.hits, 1);
  assert.equal(cache.metrics.misses, 1);
});

test("expiración: tras vencer el TTL se vuelve a producir", async () => {
  const cache = new Cache(new MemoryStore(10), { defaultTtl: 5 });
  let calls = 0;
  const produce = async () => (calls++, calls);
  assert.equal(await cache.wrap("ns", "k", produce), 1);
  await wait(15);
  assert.equal(await cache.wrap("ns", "k", produce), 2, "produjo de nuevo tras expirar");
});

test("invalidación por namespace: deja obsoletas todas las entradas al instante", async () => {
  const cache = new Cache(new MemoryStore(10), { defaultTtl: 10000 });
  let value = "antes";
  const produce = async () => value;
  assert.equal(await cache.wrap("executive", "k", produce), "antes");
  value = "después";
  assert.equal(await cache.wrap("executive", "k", produce), "antes", "sirve el valor cacheado");
  await cache.invalidate("executive");
  assert.equal(await cache.wrap("executive", "k", produce), "después", "tras invalidar, recalcula");
});

test("coherencia tras actualización: dato correcto inmediatamente después de invalidar", async () => {
  const cache = new Cache(new MemoryStore(10), { defaultTtl: 10000 });
  let total = 10;
  const dashboard = () => cache.wrap("executive", "home", async () => ({ total }));
  assert.deepEqual(await dashboard(), { total: 10 });
  // Simula una escritura seguida de su invalidación (como hace notifySurveyChange).
  total = 11;
  await cache.invalidate("executive");
  assert.deepEqual(await dashboard(), { total: 11 });
});

test("desalojo LRU: al exceder el máximo se descarta la entrada menos usada", async () => {
  const cache = new Cache(new MemoryStore(2), { defaultTtl: 10000 });
  const put = (k) => cache.wrap("ns", k, async () => k);
  await put("a");
  await put("b");
  await put("a"); // 'a' pasa a ser la más reciente
  await put("c"); // excede el máximo (2) → desaloja 'b' (la menos usada)
  let produced = 0;
  const bAgain = await cache.wrap("ns", "b", async () => (produced++, "b"));
  assert.equal(bAgain, "b");
  assert.equal(produced, 1, "'b' fue desalojada y debió producirse de nuevo");
  assert.ok(cache.metrics.evictions >= 1);
});

test("aislamiento: mutar el valor devuelto no corrompe la copia en caché", async () => {
  const cache = new Cache(new MemoryStore(10), { defaultTtl: 10000 });
  const first = await cache.wrap("ns", "k", async () => ({ list: [1, 2] }));
  first.list.push(999);
  const second = await cache.wrap("ns", "k", async () => ({ list: [1, 2] }));
  assert.deepEqual(second.list, [1, 2], "la copia cacheada no se vio afectada");
});

test("tolerancia a fallos: si el almacén falla, cae al productor sin romper la petición", async () => {
  const brokenStore = {
    async version() { throw new Error("backend caído"); },
    async get() { throw new Error("backend caído"); },
    async set() { throw new Error("backend caído"); },
    async bump() { throw new Error("backend caído"); },
  };
  const cache = new Cache(brokenStore, { defaultTtl: 1000 });
  const value = await cache.wrap("ns", "k", async () => "desde-db");
  assert.equal(value, "desde-db");
  assert.ok(cache.metrics.errors >= 1);
});

test("interruptor: CACHE_ENABLED=false desactiva la caché", async () => {
  const previous = process.env.CACHE_ENABLED;
  process.env.CACHE_ENABLED = "false";
  try {
    const cache = new Cache(new MemoryStore(10), { defaultTtl: 10000 });
    let calls = 0;
    const produce = async () => (calls++, calls);
    await cache.wrap("ns", "k", produce);
    await cache.wrap("ns", "k", produce);
    assert.equal(calls, 2, "sin caché, siempre produce");
  } finally {
    if (previous === undefined) delete process.env.CACHE_ENABLED;
    else process.env.CACHE_ENABLED = previous;
  }
});

test("métricas: la tasa de acierto se calcula correctamente", async () => {
  const cache = new Cache(new MemoryStore(10), { defaultTtl: 10000 });
  await cache.wrap("ns", "k", async () => 1); // miss
  await cache.wrap("ns", "k", async () => 1); // hit
  await cache.wrap("ns", "k", async () => 1); // hit
  const stats = cache.stats();
  assert.equal(stats.hits, 2);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hitRate, Number((2 / 3).toFixed(3)));
});
