// E2E de los dos aportes (Caché + Tiempo real) sobre la app en ejecución.
// Verifica, como lo haría un usuario real:
//   - Aporte 1: el tablero se sirve de caché (hits) y una escritura la invalida.
//   - Aporte 2: la confirmación se propaga en vivo por SSE y muestra el aviso.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { run, get } from "../lib/db.js";
import { login, prepareMfaTest } from "./auth-helper.mjs";

const origin = process.env.E2E_BASE_URL || "https://localhost:3443";

test.beforeEach(async () => {
  await prepareMfaTest();
});

test("Aporte 1 y 2: caché coherente y actualización en vivo por SSE", async ({ page }) => {
  await login(page);
  const cacheStats = async () => (await page.request.get("/api/cache/stats")).json();

  // --- Aporte 1: el tablero usa caché (la recarga es hit). ---
  await page.goto("/");
  const before = (await cacheStats()).cache;
  await page.goto("/reportes/ejecutivo");
  await page.goto("/");
  const afterLoads = (await cacheStats()).cache;
  expect(afterLoads.hits).toBeGreaterThan(before.hits);

  // --- Aporte 2: suscripción SSE desde el navegador. ---
  await page.evaluate(() => {
    window.__ev = [];
    const es = new EventSource("/api/stream");
    window.__es = es;
    ["ready", "survey.confirmed"].forEach((t) =>
      es.addEventListener(t, () => window.__ev.push(t)),
    );
  });
  await page.waitForFunction(() => window.__ev?.includes("ready"), null, {
    timeout: 10000,
  });

  // Crea una encuesta pendiente propia (prueba autosuficiente).
  const token = crypto.randomUUID();
  const inserted = await run(
    "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,priority,primary_topic,secondary_topics,extracted_data,needs_review,validation_status) VALUES(?,?,?,?,?,?,?,?,?,'[]','{}',1,?) RETURNING id",
    "e2e-aporte.png",
    `e2e-aporte-${token}.png`,
    "image/png",
    100,
    crypto.createHash("sha256").update(token).digest("hex"),
    "Pendiente de revisión",
    "Queja",
    "Medio",
    "Prueba E2E",
    "Pendiente de revisión",
  );
  const surveyId = Number(inserted.lastInsertRowid);

  try {
    // Dispara una escritura real: confirmar la encuesta.
    const bumpsBefore = afterLoads.bumps;
    const response = await page.request.post(`/api/surveys/${surveyId}/validation`, {
      headers: { origin },
      data: { action: "confirm", reason: "Verificación E2E de tiempo real" },
    });
    expect(response.status()).toBe(200);

    // SSE propaga el evento a la vista y aparece el aviso en vivo.
    await page.waitForFunction(() => window.__ev?.includes("survey.confirmed"), null, {
      timeout: 10000,
    });
    await expect(page.locator(".live-toast").first()).toBeVisible();

    // La escritura invalidó la caché (coherencia): el namespace fue incrementado.
    const afterWrite = (await cacheStats()).cache;
    expect(afterWrite.bumps).toBeGreaterThan(bumpsBefore);
  } finally {
    await page.evaluate(() => window.__es?.close());
    await run("DELETE FROM ai_evaluations WHERE survey_id=?", surveyId);
    await run("DELETE FROM surveys WHERE id=?", surveyId);
  }
});
