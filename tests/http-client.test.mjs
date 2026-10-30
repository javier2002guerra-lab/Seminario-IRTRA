import test from "node:test";
import assert from "node:assert/strict";
import { readApiJson } from "../lib/http-client.js";

test("lee una respuesta JSON válida", async () => {
  const body = await readApiJson(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  assert.deepEqual(body, { ok: true });
});

test("maneja una respuesta vacía sin lanzar SyntaxError", async () => {
  const body = await readApiJson(new Response(null, { status: 503 }));
  assert.match(body.error, /HTTP 503/);
});

test("maneja HTML de error sin exponer su contenido", async () => {
  const body = await readApiJson(
    new Response("<html>error interno sensible</html>", { status: 500 }),
  );
  assert.equal(body.error, "El servidor devolvió una respuesta inválida (HTTP 500).");
  assert.doesNotMatch(body.error, /sensible/);
});
