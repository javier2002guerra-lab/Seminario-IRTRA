import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { get, run } from "../lib/db.js";
import { decryptMfaSecret, totpAt } from "../lib/mfa.js";

const output = path.resolve("auditoria/evidencias/capturas");
fs.mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    baseURL: "https://localhost:3443",
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("/login");
  await page.screenshot({
    path: path.join(output, "01-login.png"),
    fullPage: true,
  });
  await page
    .locator('input[name="email"]')
    .fill(process.env.SUPERUSER_EMAIL || "admin@irtra.local");
  await page
    .locator('input[name="password"]')
    .fill(process.env.SUPERUSER_PASSWORD);
  await run("UPDATE users SET mfa_last_counter=NULL WHERE lower(email)=lower(?)", process.env.SUPERUSER_EMAIL || "admin@irtra.local");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.locator('input[name="code"]').waitFor({ state: "visible" });
  const account = await get("SELECT mfa_secret FROM users WHERE lower(email)=lower(?)", process.env.SUPERUSER_EMAIL || "admin@irtra.local");
  await page.locator('input[name="code"]').fill(totpAt(decryptMfaSecret(account.mfa_secret)));
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL("https://localhost:3443/");
  const guide = page.getByRole("button", { name: "Comenzar" });
  await guide.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await guide.isVisible()) await guide.click();
  await page.screenshot({
    path: path.join(output, "02-dashboard.png"),
    fullPage: true,
    mask: [page.locator(".topbar-user-data")],
  });
  await page.goto("/carga");
  await page.screenshot({
    path: path.join(output, "03-carga.png"),
    fullPage: true,
    mask: [page.locator(".topbar-user-data")],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => ({
    pixels: document.documentElement.scrollWidth - window.innerWidth,
    elements: [...document.querySelectorAll("body *")]
      .map((element) => ({
        selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${[...element.classList].map((name) => `.${name}`).join("")}`,
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
      }))
      .filter((item) => item.right > window.innerWidth + 1)
      .slice(0, 12),
  }));
  console.log(`Responsive móvil: ${JSON.stringify(overflow)}`);
  await page.screenshot({
    path: path.join(output, "04-dashboard-movil.png"),
    fullPage: true,
    mask: [page.locator(".topbar-user-data")],
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  console.log(
    `Responsive tableta: ${JSON.stringify(
      await page.evaluate(() => ({
        pixels: document.documentElement.scrollWidth - window.innerWidth,
        bodyWidth: Math.round(document.body.getBoundingClientRect().width),
        shellWidth: Math.round(
          document.querySelector(".shell").getBoundingClientRect().width,
        ),
        mainWidth: Math.round(
          document.querySelector(".main").getBoundingClientRect().width,
        ),
      })),
    )}`,
  );
  await page.screenshot({
    path: path.join(output, "05-dashboard-tableta.png"),
    fullPage: true,
    mask: [page.locator(".topbar-user-data")],
  });
  console.log("Capturas generadas: 5");
} finally {
  await browser.close();
}
