import fs from "node:fs";
import cypress from "cypress";
// Electron interprets this variable as a request to run Node, not the browser.
delete process.env.ELECTRON_RUN_AS_NODE;
const results = await cypress.run({ browser: process.env.QA_BROWSER || "chrome", configFile: "cypress.config.mjs" });
fs.mkdirSync("auditoria/evidencias", { recursive: true });
const report = {
  startedAt: results.startedTestsAt, endedAt: results.endedTestsAt,
  totalTests: results.totalTests, totalPassed: results.totalPassed, totalFailed: results.totalFailed,
  totalSkipped: results.totalSkipped, totalPending: results.totalPending,
  runs: results.runs?.map(run => ({ spec: run.spec.relative, stats: run.stats, tests: run.tests.map(test => ({ title: test.title, state: test.state, error: test.displayError })) })),
};
fs.writeFileSync("auditoria/evidencias/CYPRESS_RESULTADO.json", JSON.stringify(report, null, 2));
process.exitCode = results.failures || results.totalFailed || !results.totalTests ? 1 : 0;
