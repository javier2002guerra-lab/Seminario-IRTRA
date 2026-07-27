import { spawnSync } from "node:child_process";
import path from "node:path";

const python = process.platform === "win32" ? "python" : "python3";
const target = path.resolve(".python-packages");
const result = spawnSync(
  python,
  ["-m", "pip", "install", "--disable-pip-version-check", "--target", target, "-r", "requirements-excel.txt"],
  { stdio: "inherit", windowsHide: true },
);

if (result.status !== 0)
  throw new Error("No fue posible instalar las dependencias necesarias para exportar Excel.");
