import { expect } from "@playwright/test";
import { get, run } from "../lib/db.js";
import { decryptMfaSecret, totpAt } from "../lib/mfa.js";

export async function prepareMfaTest() {
  await run("DELETE FROM login_attempts");
  await run("DELETE FROM request_limits WHERE key LIKE 'mfa:%'");
  await run(
    "UPDATE users SET mfa_last_counter=NULL WHERE lower(email)=lower(?)",
    "admin@irtra.local",
  );
}

export async function login(page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@irtra.local");
  await page
    .locator('input[name="password"]')
    .fill(
      process.env.E2E_ADMIN_PASSWORD ||
        process.env.SUPERUSER_PASSWORD ||
        "Cambiar-Ahora-2026!",
    );
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.locator('input[name="code"]').waitFor({ state: "visible" });
  const visibleSecret = page.getByTestId("mfa-secret");
  let secret;
  if (await visibleSecret.isVisible().catch(() => false))
    secret = (await visibleSecret.textContent()).trim();
  else {
    const user = await get(
      "SELECT mfa_secret FROM users WHERE lower(email)=lower(?)",
      "admin@irtra.local",
    );
    secret = decryptMfaSecret(user.mfa_secret);
  }
  await page.locator('input[name="code"]').fill(totpAt(secret));
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  const recovery = page.getByTestId("recovery-codes");
  await recovery.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await recovery.isVisible().catch(() => false))
    await page.getByRole("button", { name: "Confirmo que los guardé" }).click();
  await expect(page).toHaveURL(new URL("/", process.env.E2E_BASE_URL || "https://localhost:3443").href);
  const guide = page.getByRole("button", { name: "Comenzar" });
  if (await guide.isVisible().catch(() => false)) await guide.click();
}
