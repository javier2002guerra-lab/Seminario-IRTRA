export function boundedConcurrency(value, maximum = 8) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, maximum);
}

export async function processBoundedQueue(items, worker, concurrency = 1) {
  if (!Array.isArray(items)) throw new TypeError("items debe ser un arreglo");
  if (typeof worker !== "function")
    throw new TypeError("worker debe ser una función");
  if (!items.length) return [];

  const results = new Array(items.length);
  const workerCount = Math.min(
    items.length,
    boundedConcurrency(concurrency),
  );
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, consume));
  return results;
}
