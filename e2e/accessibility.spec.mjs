import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("las pantallas principales no tienen barreras críticas de accesibilidad", async ({
  page,
}) => {
  await page.goto("/login");
  let results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((x) =>
      ["critical", "serious"].includes(x.impact),
    ),
  ).toEqual([]);
  await page
    .locator('input[name="password"]')
    .fill(
      process.env.E2E_ADMIN_PASSWORD ||
        process.env.SUPERUSER_PASSWORD ||
        "Cambiar-Ahora-2026!",
    );
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await page.waitForURL("https://localhost:3443/");
  const guide = page.getByRole("button", { name: "Comenzar" });
  if (await guide.isVisible().catch(() => false)) await guide.click();
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((x) =>
      ["critical", "serious"].includes(x.impact),
    ),
  ).toEqual([]);
});
