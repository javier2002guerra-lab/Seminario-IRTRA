import { migrate, closeDatabase } from "../lib/db.js";
try {
  await migrate();
  console.log("Migraciones PostgreSQL aplicadas correctamente.");
} finally {
  await closeDatabase();
}
