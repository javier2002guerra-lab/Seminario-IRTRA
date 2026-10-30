import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const python = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
const target = path.resolve(".python-packages");
const lock = path.resolve("excel-deps.lock");
const checker = path.resolve("scripts", "check-python-deps.py");
const locked = fs
  .readFileSync(lock, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [name, version] = line.split("==");
    if (!name || !version)
      throw new Error(`Dependencia Python no fijada: ${line}`);
    return { module: name.replace(/[-.]/g, "_"), version };
  });
const localDepsPresent = () =>
  locked.every(
    ({ module, version }) =>
      fs.existsSync(path.join(target, module)) &&
      fs.existsSync(path.join(target, `${module}-${version}.dist-info`)),
  );
const check = () =>
  spawnSync(python, [checker, lock, target], {
    encoding: "utf8",
    windowsHide: true,
  });

if (localDepsPresent() && check().status === 0) {
  console.log("Dependencias Python de Excel verificadas desde el lockfile.");
  process.exit(0);
}

const result = spawnSync(
  python,
  ["-m", "pip", "install", "--disable-pip-version-check", "--upgrade", "--target", target, "-r", lock],
  { stdio: "inherit", windowsHide: true },
);

if (result.status !== 0 || !localDepsPresent() || check().status !== 0)
  throw new Error("No fue posible instalar las dependencias necesarias para exportar Excel.");
