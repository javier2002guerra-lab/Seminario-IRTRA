import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const dir = path.resolve("docs/informe");
const read = (p) => fs.readFileSync(p, "utf8");
let html = read(path.join(dir, "INFORME_TECNICO_APORTES.html"));
html = html
  .replace("__D1__", read("docs/diagramas/arquitectura.mmd"))
  .replace("__D2__", read("docs/diagramas/modelo-datos.mmd"))
  .replace("__D3__", read("docs/diagramas/secuencia-flujo-critico.mmd"));

const buildPath = path.join(dir, ".__build.html");
fs.writeFileSync(buildPath, html);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto("file:///" + buildPath.replace(/\\/g, "/"), { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__mermaidReady === true, null, { timeout: 30000 });
await page.waitForTimeout(500);
const out = path.resolve("docs/INFORME_TECNICO_APORTES.pdf");
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();
fs.unlinkSync(buildPath);
console.log("PDF generado:", out, fs.statSync(out).size, "bytes");
