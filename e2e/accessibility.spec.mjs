import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, prepareMfaTest } from "./auth-helper.mjs";
test.beforeEach(async () => {
  await prepareMfaTest();
});
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
  await login(page);
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((x) =>
      ["critical", "serious"].includes(x.impact),
    ),
  ).toEqual([]);
});

test("login y tablero no desbordan en teléfono ni tableta", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    const loginOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(loginOverflow).toBeLessThanOrEqual(1);
  }
  await login(page);
  const guide = page.getByRole("button", { name: "Comenzar" });
  await guide.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await guide.isVisible()) await guide.click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const dashboardOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(dashboardOverflow).toBeLessThanOrEqual(1);
  }
});
