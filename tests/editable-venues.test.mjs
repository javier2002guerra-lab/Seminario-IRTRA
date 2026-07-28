import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const editor = fs.readFileSync(
  new URL("../app/encuestas/[id]/data-editor.js", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../app/api/surveys/[id]/data/route.js", import.meta.url),
  "utf8",
);

test("el formato editable muestra Restaurante, Hotel y Lugar de origen en la misma fila", () => {
  const venues = editor.match(
    /<div className="editor-venues">([\s\S]*?)<\/div>/,
  )?.[1] || "";
  assert.match(venues, /label="Restaurante"/);
  assert.match(venues, /label="Hotel"/);
  assert.match(venues, /label="Lugar de origen"/);
});

test("el guardado conserva Restaurante, Hotel y Lugar de origen", () => {
  assert.match(route, /restaurant=\?,hotel=\?,origin_place=\?/);
  assert.doesNotMatch(route, /restaurant=NULL|hotel=NULL/);
});
