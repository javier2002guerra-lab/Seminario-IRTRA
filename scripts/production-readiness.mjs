import { validateProductionSecurity } from "../lib/security.js";
import {
  closeDatabase,
  get,
  query,
  validateDatabaseSecurity,
} from "../lib/db.js";
import { checkMalwareScanner } from "../lib/malware-scan.js";

const checks = [];
async function check(name, action) {
  try {
    await action();
    checks.push({ name, status: "pass" });
  } catch (error) {
    checks.push({
      name,
      status: "fail",
      message: String(error?.message || error).slice(0, 240),
    });
  }
}

await check("environment", () => validateProductionSecurity({ production: true }));
await check("database-least-privilege-and-tls", () =>
  validateDatabaseSecurity(),
);
await check("antimalware", async () => {
  if (!(await checkMalwareScanner())) throw new Error("ClamAV no está activo.");
});
await check("mfa-for-active-users", async () => {
  const row = await get(
    "SELECT count(*)::int n FROM users WHERE active=1 AND mfa_enabled<>1",
  );
  if (Number(row?.n || 0))
    throw new Error(`${row.n} cuenta(s) activa(s) todavía no registraron MFA.`);
});
await check("redundant-administrators", async () => {
  const row = await get(
    "SELECT count(*)::int n FROM users WHERE active=1 AND role='admin' AND mfa_enabled=1",
  );
  if (Number(row?.n || 0) < 2)
    throw new Error("Se requieren al menos dos administradores activos con MFA para recuperación controlada.");
});
await check("area-assignment-for-verifiers", async () => {
  const row = await get(
    "SELECT count(*)::int n FROM users u WHERE u.active=1 AND u.role='verificador' AND NOT EXISTS (SELECT 1 FROM user_areas ua WHERE ua.user_id=u.id)",
  );
  if (Number(row?.n || 0))
    throw new Error(`${row.n} verificador(es) no tienen área asignada.`);
});
await check("validated-constraints", async () => {
  const required = [
    "users_role_valid",
    "users_flags_valid",
    "surveys_confidence_valid",
    "surveys_size_valid",
  ];
  const rows = await query(
    "SELECT conname,convalidated FROM pg_constraint WHERE conname=ANY(?::text[])",
    required,
  );
  if (
    rows.length !== required.length ||
    rows.some((row) => !row.convalidated)
  )
    throw new Error("Faltan constraints validados.");
});
await check("immutable-audit-triggers", async () => {
  const row = await get(
    "SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='audit_log'::regclass AND tgname IN ('audit_no_update','audit_no_delete') AND NOT tgisinternal",
  );
  if (Number(row?.n || 0) !== 2)
    throw new Error("La bitácora no tiene ambos triggers de inmutabilidad.");
});

console.log(JSON.stringify({ ready: checks.every((x) => x.status === "pass"), checks }, null, 2));
await closeDatabase();
if (checks.some((item) => item.status === "fail")) process.exitCode = 1;
