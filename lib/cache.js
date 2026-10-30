// Aporte 1 — Caché (patrón cache-aside con expiración e invalidación).
//
// Capa de caché para las lecturas pesadas del tablero ejecutivo. Implementa el
// patrón cache-aside: la aplicación consulta la caché, y solo ante un fallo
// (miss) calcula el valor en PostgreSQL y lo guarda. La invalidación es por
// versión de namespace (O(1)): al escribir una encuesta/acción se incrementa la
// versión y todas las entradas previas dejan de coincidir, garantizando
// coherencia inmediata tras una actualización.
//
// Backend local (memoria, LRU + TTL) por defecto; opcionalmente distribuido con
// Redis (CACHE_BACKEND=redis + REDIS_URL) usando la misma interfaz asíncrona.

function clone(value) {
  if (value === undefined || value === null) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

// Almacén en memoria con expiración (TTL) y desalojo LRU acotado.
export class MemoryStore {
  constructor(max = 500) {
    this.name = "memory";
    this.max = Math.max(1, Number(max) || 500);
    this.map = new Map();
    this.versions = new Map();
  }
  async version(ns) {
    return this.versions.get(ns) || 1;
  }
  async bump(ns) {
    this.versions.set(ns, (this.versions.get(ns) || 1) + 1);
  }
  async get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.exp <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Reinsertar mueve la clave al final: orden de uso reciente para LRU.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.val;
  }
  async set(key, val, ttlMs) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { val, exp: Date.now() + Math.max(1, ttlMs) });
    let evicted = 0;
    while (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
      evicted++;
    }
    return evicted;
  }
  async clear() {
    this.map.clear();
    this.versions.clear();
  }
  get size() {
    return this.map.size;
  }
}

export class Cache {
  constructor(store, { defaultTtl = 60000 } = {}) {
    // Acepta un almacén directo (pruebas) o un resolvedor (permite cambiar a
    // Redis en caliente sin top-level await, compatible con el bundler).
    this._resolve = typeof store === "function" ? store : () => store;
    this.defaultTtl = defaultTtl;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      errors: 0,
      bumps: 0,
    };
  }
  enabled() {
    return process.env.CACHE_ENABLED !== "false";
  }
  // Cache-aside: devuelve el valor en caché o lo produce y lo guarda.
  // Ante cualquier error del almacén nunca falla la petición: cae al productor.
  async wrap(ns, key, producer, ttlMs = this.defaultTtl) {
    if (!this.enabled()) return producer();
    const store = this._resolve();
    let full;
    try {
      const version = await store.version(ns);
      full = `${ns}:v${version}:${key}`;
      const hit = await store.get(full);
      if (hit !== undefined) {
        this.metrics.hits++;
        return clone(hit);
      }
    } catch {
      this.metrics.errors++;
      return producer();
    }
    this.metrics.misses++;
    const value = await producer();
    try {
      const evicted = await store.set(full, clone(value), ttlMs);
      this.metrics.sets++;
      this.metrics.evictions += Number(evicted) || 0;
    } catch {
      this.metrics.errors++;
    }
    return value;
  }
  // Invalidación por namespace: invalida de inmediato todo lo cacheado para él.
  async invalidate(ns) {
    try {
      await this._resolve().bump(ns);
      this.metrics.bumps++;
    } catch {
      this.metrics.errors++;
    }
  }
  stats() {
    const store = this._resolve();
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      backend: store?.name || store?.constructor?.name || "unknown",
      entries: store?.size ?? null,
      hitRate: total ? Number((this.metrics.hits / total).toFixed(3)) : 0,
      enabled: this.enabled(),
    };
  }
  reset() {
    for (const key of Object.keys(this.metrics)) this.metrics[key] = 0;
    return this._resolve()?.clear?.();
  }
}

const maxEntries = Number(process.env.CACHE_MAX_ENTRIES) || 500;
const defaultTtl = Number(process.env.CACHE_TTL_MS) || 60000;

// Almacén activo: memoria por defecto (síncrono, sin top-level await). Si se
// configura Redis, se carga en segundo plano y se sustituye al conectar; si
// falla, se conserva la memoria local. Un resolvedor evita referencias fijas.
function createCache() {
  let activeStore = new MemoryStore(maxEntries);
  if (process.env.CACHE_BACKEND === "redis" && process.env.REDIS_URL) {
    import("./cache-redis.js")
      .then(({ RedisStore }) => RedisStore.create(process.env.REDIS_URL))
      .then((redisStore) => {
        activeStore = redisStore;
      })
      .catch((error) => {
        console.warn(
          `Caché distribuida no disponible (${error.message}); se usa memoria local.`,
        );
      });
  }
  return new Cache(() => activeStore, { defaultTtl });
}

// Singleton compartido vía globalThis: en producción Next empaqueta cada ruta
// por separado, por lo que un singleton a nivel de módulo se duplicaría por
// bundle. Anclarlo al global garantiza una única caché para todo el proceso, de
// modo que la invalidación desde las rutas de escritura afecte a la misma caché
// que leen las páginas del tablero.
export const cache = (globalThis.__irtraCache ??= createCache());

// Namespaces lógicos de caché del dominio.
export const NS = { executive: "executive" };

// Invalida las vistas derivadas de encuestas (tablero ejecutivo y alertas).
// Se llama en cada escritura que afecte encuestas, acciones o recuperación.
export async function invalidateExecutive() {
  await cache.invalidate(NS.executive);
}

export function cacheStats() {
  return cache.stats();
}
