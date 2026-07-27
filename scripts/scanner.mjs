import { startScannerWatcher } from "../lib/scanner-watch.js";
import { migrate } from "../lib/db.js";
await migrate();
startScannerWatcher();
console.log("Monitor del escáner activo. Presione Ctrl+C para detenerlo.");
await new Promise(() => {});
