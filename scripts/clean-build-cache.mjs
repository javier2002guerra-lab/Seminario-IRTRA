import fs from "node:fs";
import path from "node:path";

const buildRoot = path.resolve(".next");
for (const name of ["cache", "dev"]) {
  const target = path.resolve(buildRoot, name);
  if (path.dirname(target) !== buildRoot)
    throw new Error(`Ruta de caché inesperada: ${target}`);
  fs.rmSync(target, { recursive: true, force: true });
}
console.log("Cachés de compilación eliminadas del artefacto.");
