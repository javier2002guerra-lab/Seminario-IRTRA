import test from "node:test";
import assert from "node:assert/strict";
import {
  boundedConcurrency,
  processBoundedQueue,
} from "../lib/bounded-queue.js";

test("procesa 100 trabajos sin exceder la concurrencia ni mezclar resultados", async () => {
  const input = Array.from({ length: 100 }, (_, index) => ({
    id: `encuesta-${index + 1}`,
    expected: index * 17,
  }));
  let active = 0;
  let maximumActive = 0;

  const output = await processBoundedQueue(
    input,
    async (job, index) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, index % 4));
      active--;
      return { id: job.id, value: job.expected };
    },
    8,
  );

  assert.equal(output.length, 100);
  assert.ok(maximumActive > 1);
  assert.ok(maximumActive <= 8);
  assert.deepEqual(
    output,
    input.map((job) => ({ id: job.id, value: job.expected })),
  );
});

test("normaliza valores inseguros de concurrencia", () => {
  assert.equal(boundedConcurrency(0), 1);
  assert.equal(boundedConcurrency("invalido"), 1);
  assert.equal(boundedConcurrency(100), 8);
  assert.equal(boundedConcurrency(4), 4);
});
