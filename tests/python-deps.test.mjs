import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("las dependencias Python de Excel coinciden exactamente con el lockfile", () => {
  const root = process.cwd();
  const python = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(
    python,
    [
      path.join(root, "scripts", "check-python-deps.py"),
      path.join(root, "excel-deps.lock"),
      path.join(root, ".python-packages"),
    ],
    { encoding: "utf8", timeout: 30000, windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    ready: true,
    missing_or_mismatched: {},
  });
});
