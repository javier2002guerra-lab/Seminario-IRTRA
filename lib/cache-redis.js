// Adaptador de caché distribuida (opcional) para la clase Cache de lib/cache.js.
//
// Implementa la misma interfaz asíncrona que MemoryStore usando Redis, de modo
// que el patrón cache-aside y la invalidación por versión de namespace operen
// de forma compartida entre varias instancias de la aplicación (escalado
// horizontal). Se activa solo con CACHE_BACKEND=redis y REDIS_URL, y depende de
// "ioredis" como dependencia opcional; si no está instalada, lib/cache.js cae
// automáticamente al almacén en memoria.

export class RedisStore {
  constructor(client, { prefix = "irtra:cache:" } = {}) {
    this.name = "redis";
    this.client = client;
    this.prefix = prefix;
  }

  static async create(url) {
    // Dependencia opcional: se resuelve solo en tiempo de ejecución cuando se
    // activa Redis. Los comentarios evitan que el bundler intente resolverla.
    const { default: Redis } = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ "ioredis"
    );
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    // Falla rápido si no hay conexión, para que lib/cache.js use memoria.
    await client.connect?.().catch(() => {});
    await client.ping();
    return new RedisStore(client);
  }

  async version(ns) {
    const value = await this.client.get(`${this.prefix}ver:${ns}`);
    return Number(value) || 1;
  }

  async bump(ns) {
    // INCR es atómico: seguro entre múltiples instancias concurrentes.
    await this.client.incr(`${this.prefix}ver:${ns}`);
  }

  async get(key) {
    const raw = await this.client.get(this.prefix + key);
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async set(key, val, ttlMs) {
    // Redis aplica el TTL y su propia política de desalojo (maxmemory-policy).
    await this.client.set(
      this.prefix + key,
      JSON.stringify(val),
      "PX",
      Math.max(1, ttlMs),
    );
    return 0;
  }

  async clear() {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length) await this.client.del(keys);
  }
}
