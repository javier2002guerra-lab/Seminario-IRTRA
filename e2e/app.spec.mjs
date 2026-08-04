import { test, expect } from "@playwright/test";
import { run, get } from "../lib/db.js";
async function login(page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@irtra.local");
  await page
    .locator('input[name="password"]')
    .fill(
      process.env.E2E_ADMIN_PASSWORD ||
        process.env.SUPERUSER_PASSWORD ||
        "Cambiar-Ahora-2026!",
    );
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await expect(page).toHaveURL("https://localhost:3443/");
  const guide = page.getByRole("button", { name: "Comenzar" });
  if (await guide.isVisible().catch(() => false)) await guide.click();
}
test("protege la aplicación y permite navegar al superusuario", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Centro ejecutivo de experiencia" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Escanear o cargar/ }).click();
  await expect(
    page.getByRole("heading", { name: "Escanear o cargar encuestas" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Usuarios/ }).click();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await page.getByRole("link", { name: /Áreas/ }).click();
  await expect(
    page.getByRole("heading", { name: "Áreas y responsables" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test("edita, confirma, reabre y elimina una encuesta con auditoría", async ({
  page,
}) => {
  const sha = `workflow-${Date.now()}`,
    created = await run(
      "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,extracted_data) VALUES(?,?,?,?,?,'Pendiente de revisión','{}') RETURNING id",
      "flujo-prueba.png",
      `${sha}.png`,
      "image/png",
      100,
      sha,
    ),
    id = created.lastInsertRowid;
  try {
    await login(page);
    const numbered = Object.fromEntries(
      Array.from({ length: 14 }, (_, i) => [
        `item_${i + 1}`,
        i === 13 ? "Mejorar iluminación" : "",
      ]),
    );
    let r = await page.request.patch(`/api/surveys/${id}/data`, {
      headers: { origin: "https://localhost:3443" },
      data: {
        general: { visitor_name: "Persona corregida" },
        numbered,
        ratings: [{ service: "Calidad de comida", rating: "Bueno" }],
        restauranteId: "LA_HACIENDA",
        hotelId: "SAN_MARTIN",
        reason: "Corrección humana de prueba",
      },
    });
    expect(r.status()).toBe(200);
    let saved = await get(
      "SELECT restaurant,hotel,validation_status,needs_review FROM surveys WHERE id=?",
      id,
    );
    expect(saved).toMatchObject({
      restaurant: "LA HACIENDA",
      hotel: "SAN MARTIN",
      validation_status: "En revisión",
      needs_review: 1,
    });
    r = await page.request.post(`/api/surveys/${id}/validation`, {
      headers: { origin: "https://localhost:3443" },
      data: { action: "confirm", reason: "Información revisada correctamente" },
    });
    expect(r.status()).toBe(200);
    saved = await get(
      "SELECT validation_status,needs_review FROM surveys WHERE id=?",
      id,
    );
    expect(saved).toMatchObject({
      validation_status: "Confirmada",
      needs_review: 0,
    });
    r = await page.request.post(`/api/surveys/${id}/validation`, {
      headers: { origin: "https://localhost:3443" },
      data: { action: "reopen", reason: "Se detectó una corrección adicional" },
    });
    expect(r.status()).toBe(200);
    r = await page.request.post(`/api/surveys/${id}/deletion`, {
      headers: { origin: "https://localhost:3443" },
      data: {
        action: "request",
        reason: "Eliminar registro generado por prueba",
      },
    });
    expect(r.status()).toBe(200);
    r = await page.request.post(`/api/surveys/${id}/deletion`, {
      headers: { origin: "https://localhost:3443" },
      data: { action: "approve", reason: "Solicitud de prueba aprobada" },
    });
    expect(r.status()).toBe(200);
    expect(await get("SELECT id FROM surveys WHERE id=?", id)).toBeUndefined();
    expect(
      (
        await get(
          "SELECT count(*)::int n FROM audit_log WHERE entity_id=? AND action='DELETION_APPROVE'",
          String(id),
        )
      ).n,
    ).toBe(1);
  } finally {
    if (await get("SELECT id FROM surveys WHERE id=?", id)) {
      await run("DELETE FROM deletion_requests WHERE survey_id=?", id);
      await run("DELETE FROM ai_evaluations WHERE survey_id=?", id);
      await run("DELETE FROM service_ratings WHERE survey_id=?", id);
      await run("DELETE FROM corrections WHERE survey_id=?", id);
      await run("DELETE FROM surveys WHERE id=?", id);
    }
  }
});
test("rechaza credenciales incorrectas sin filtrar información", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator('input[name="password"]').fill("incorrecta");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await expect(page.getByText("Credenciales incorrectas.")).toBeVisible();
});
test("bloquea API sin sesión", async ({ request }) => {
  const r = await request.get("/api/export", { maxRedirects: 0 });
  expect([307, 401]).toContain(r.status());
});
test("genera internamente el informe gerencial", async ({ page }) => {
  await login(page);
  const response = await page.request.get("/api/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("macroEnabled");
  expect(response.headers()["content-disposition"]).toContain(
    "INFORME GERENCIAL ",
  );
  const body = await response.body();
  expect(body.subarray(0, 2).toString()).toBe("PK");
  expect(body.length).toBeGreaterThan(100000);
});
test("carga encuestas y auditoría sin errores PostgreSQL", async ({ page }) => {
  await login(page);
  await page.goto("/encuestas");
  await expect(
    page.getByRole("heading", { name: "Encuestas procesadas" }),
  ).toBeVisible();
  await page.goto("/auditoria");
  await expect(
    page.getByRole("heading", { name: "Registro de auditoría" }),
  ).toBeVisible();
});
test("muestra la boleta digital con el formato de la hoja física", async ({
  page,
}) => {
  const sha = `e2e-${Date.now()}`,
    created = await run(
      "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status,category,priority,confidence,summary,extracted_data,needs_review) VALUES(?,?,?,?,?,'Procesado','Sugerencia','Bajo',0.92,'Caso de validación visual',?,0) RETURNING id",
      "boleta-prueba.png",
      `${sha}.png`,
      "image/png",
      100,
      sha,
      JSON.stringify({
        general_data: {
          visitor_name: "Visitante de prueba",
          visit_date: "13/07/2026",
        },
        numbered_answers: { item_7: "Sí", item_14: "Mejorar señalización" },
      }),
    );
  const id = created.lastInsertRowid;
  try {
    await run(
      "INSERT INTO service_ratings(survey_id,service_name,rating,score,negative) VALUES(?,?,'Excelente',5,0)",
      id,
      "Cortesía del personal",
    );
    await login(page);
    await page.goto(`/encuestas/${id}`);
    await page.getByRole("button", { name: "Ver campos editables" }).click();
    await expect(page.getByText("Estimado visitante")).toBeVisible();
    await expect(page.locator('input[name="visitor_name"]')).toHaveValue(
      "Visitante de prueba",
    );
    await expect(
      page.getByRole("columnheader", { name: "Excelente" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Cortesía del personal X/ }),
    ).toBeVisible();
  } finally {
    await run("DELETE FROM service_ratings WHERE survey_id=?", id);
    await run("DELETE FROM surveys WHERE id=?", id);
  }
});
test("abre el centro ejecutivo, planes de acción e informe gerencial", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByText("Satisfacción general", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Planes de acción/ }).click();
  await expect(
    page.getByRole("heading", { name: "Planes de acción" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear plan de acción" }),
  ).toBeVisible();
  const report = await page.request.get("/reportes/ejecutivo");
  expect(report.status()).toBe(200);
  expect(await report.text()).toContain("Informe ejecutivo de experiencia");
});
test("valida impacto financiero, salud e integraciones empresariales", async ({
  page,
}) => {
  await login(page);
  let response = await page.request.get("/api/health");
  expect(response.status()).toBe(200);
  expect((await response.json()).status).toBe("healthy");
  response = await page.request.post("/api/actions", {
    headers: { origin: "https://localhost:3443" },
    data: {
      title: "Acción financiera de prueba",
      description: "Validación automática",
      priority: "Medio",
      expected_impact: "Reducir recurrencia",
      estimated_savings: 500,
    },
  });
  expect(response.status()).toBe(201);
  const actionId = (await response.json()).id;
  try {
    response = await page.request.patch(`/api/actions/${actionId}/finance`, {
      headers: { origin: "https://localhost:3443" },
      data: {
        financial_status: "Validado",
        actual_savings: 425,
        financial_note: "Validación contable automatizada de prueba",
      },
    });
    expect(response.status()).toBe(200);
    expect(
      await get(
        "SELECT financial_status,actual_savings FROM action_plans WHERE id=?",
        actionId,
      ),
    ).toMatchObject({ financial_status: "Validado", actual_savings: "425.00" });
    await page.goto("/integraciones");
    await expect(
      page.getByRole("heading", { name: "Informes e integraciones" }),
    ).toBeVisible();
  } finally {
    await run("DELETE FROM action_plans WHERE id=?", actionId);
  }
});
