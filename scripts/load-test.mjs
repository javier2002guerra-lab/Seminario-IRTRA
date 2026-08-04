process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = process.env.LOAD_TEST_URL || "https://localhost:3443",
  durationMs = Number(process.env.LOAD_TEST_DURATION_MS || 10000),
  concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 20);
async function request(path) {
  const start = performance.now();
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    headers: { "user-agent": "IRTRA-load-validation" },
  });
  await response.arrayBuffer();
  return { status: response.status, latency: performance.now() - start };
}
async function run(path) {
  const until = Date.now() + durationMs,
    latencies = [];
  let errors = 0,
    total = 0;
  async function worker() {
    while (Date.now() < until) {
      try {
        const result = await request(path);
        total++;
        latencies.push(result.latency);
        if (result.status >= 400) errors++;
      } catch {
        errors++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  latencies.sort((a, b) => a - b);
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0,
    rps = total / (durationMs / 1000);
  console.log(
    `${path}: ${rps.toFixed(1)} req/s · p99 ${Math.round(p99)} ms · errores ${errors}`,
  );
  if (errors > 0 || p99 > 3000) process.exitCode = 1;
}
for (const path of ["/api/health", "/login"]) await run(path);
