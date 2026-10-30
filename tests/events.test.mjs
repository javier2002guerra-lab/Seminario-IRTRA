import test from "node:test";
import assert from "node:assert/strict";
import {
  publish,
  subscribe,
  formatSse,
  liveStats,
  resetEventsForTests,
} from "../lib/events.js";

test("publish entrega el evento a los suscriptores con id e instante", () => {
  resetEventsForTests();
  const received = [];
  const unsubscribe = subscribe((e) => received.push(e));
  const event = publish("survey.ingested", { entityId: 7, source: "scanner" });
  assert.equal(received.length, 1);
  assert.equal(received[0].type, "survey.ingested");
  assert.equal(received[0].entityId, 7);
  assert.equal(received[0].id, 1);
  assert.ok(Date.parse(event.at));
  unsubscribe();
});

test("ids monótonos y crecientes por cada publicación", () => {
  resetEventsForTests();
  const a = publish("a");
  const b = publish("b");
  assert.equal(b.id, a.id + 1);
});

test("unsubscribe detiene la entrega de eventos", () => {
  resetEventsForTests();
  let count = 0;
  const unsubscribe = subscribe(() => count++);
  publish("x");
  unsubscribe();
  publish("y");
  assert.equal(count, 1, "no recibe eventos tras cancelar la suscripción");
});

test("formatSse produce un bloque SSE válido (id, event y data)", () => {
  const text = formatSse({ id: 3, type: "survey.updated", at: "2026-01-01T00:00:00Z", entityId: 9 });
  assert.match(text, /^id: 3\n/);
  assert.match(text, /\nevent: survey\.updated\n/);
  assert.match(text, /\ndata: \{.*"entityId":9.*\}\n\n$/);
});

test("no filtra datos sensibles: el payload solo lleva identificadores y tipo", () => {
  resetEventsForTests();
  let payload;
  const unsubscribe = subscribe((e) => (payload = e));
  publish("survey.confirmed", { entityId: 5 });
  assert.deepEqual(Object.keys(payload).sort(), ["at", "entityId", "id", "type"]);
  unsubscribe();
});

test("límite de clientes: rechaza conexiones al superar el cupo configurado", async () => {
  process.env.SSE_MAX_CLIENTS = "2";
  // Import fresco para tomar el nuevo límite (query distinta = módulo nuevo).
  const ev = await import("../lib/events.js?cap-test");
  assert.equal(ev.acquireClient(), true);
  assert.equal(ev.acquireClient(), true);
  assert.equal(ev.acquireClient(), false, "tercera conexión rechazada");
  ev.releaseClient();
  assert.equal(ev.acquireClient(), true, "al liberar una, admite de nuevo");
  assert.equal(ev.liveStats().maxClients, 2);
  delete process.env.SSE_MAX_CLIENTS;
});

test("liveStats refleja el último id publicado", () => {
  resetEventsForTests();
  publish("a");
  publish("b");
  assert.equal(liveStats().lastEventId, 2);
});
