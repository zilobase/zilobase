import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSerializationStateForTests,
  runSerialized,
  structuralSerializationKey,
  viewSerializationKey,
} from "./serialize";

test("metadata writes serialize within their own source or host", async () => {
  clearSerializationStateForTests();
  for (const key of [structuralSerializationKey("source"), viewSerializationKey("host")]) {
    const order: number[] = [];
    const first = runSerialized(key, async () => {
      await Promise.resolve();
      order.push(1);
    });
    const second = runSerialized(key, async () => {
      order.push(2);
    });
    await Promise.all([first, second]);
    assert.deepEqual(order, [1, 2]);
  }
});
test("a rejected metadata write releases its successor", async () => {
  const first = runSerialized("metadata", async () => {
    throw new Error("rejected");
  });
  const second = runSerialized("metadata", async () => "saved");
  await assert.rejects(first, /rejected/);
  assert.equal(await second, "saved");
});
