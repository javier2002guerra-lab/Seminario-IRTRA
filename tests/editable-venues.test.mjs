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

test("el formato editable muestra Lugar de origen, Hotel y Restaurante en la misma fila", () => {
  const venues = editor.match(
    /<div className="editor-venues">([\s\S]*?)<\/div>/,
  )?.[1] || "";
  assert.match(venues, /<strong>Lugar de origen<\/strong>/);
  assert.match(venues, /name="origin_place"[\s\S]*name="hotelId"[\s\S]*name="restauranteId"/);
  assert.match(venues, /name="hotelId"/);
  assert.match(venues, /Seleccione un hotel/);
  assert.match(venues, /name="restauranteId"/);
  assert.match(venues, /Seleccione un restaurante/);
});

test("el guardado conserva Restaurante, Hotel y Lugar de origen", () => {
  assert.match(route, /restaurant=\?,hotel=\?,origin_place=\?/);
  assert.match(route, /b\.hotelId/);
  assert.match(route, /b\.restauranteId/);
  assert.doesNotMatch(route, /restaurant=NULL|hotel=NULL/);
});
