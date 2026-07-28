import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync(
  new URL("../app/encuestas/[id]/review-workspace.js", import.meta.url),
  "utf8",
);

test("el visor permite que Edge muestre los PDF escaneados", () => {
  assert.match(workspace, /record\.mime_type === "application\/pdf" \? <iframe/);
  assert.doesNotMatch(workspace, /<iframe[^>]*\bsandbox=/);
  assert.match(workspace, /referrerPolicy="no-referrer"/);
});
