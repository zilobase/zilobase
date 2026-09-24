import assert from "node:assert/strict";
import { test } from "vitest";
import { Effect, Schema, SchemaTransformation } from "effect";

import { decodeJsonBody, parseJsonBody, parseUnknown } from "./schema-json";

const Payload = Schema.Struct({
  name: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1)),
  ),
});

function request(body: unknown) {
  return {
    async json() {
      if (body === "throw") throw new SyntaxError("bad json");
      return body;
    },
  };
}

test("decodeJsonBody decodes a valid JSON object", async () => {
  const payload = await Effect.runPromise(decodeJsonBody(request({ name: " Inbox " }), Payload));
  assert.deepEqual(payload, { name: "Inbox" });
});

test("parseJsonBody maps schema failures without throwing", async () => {
  const invalid = await parseJsonBody(request({ name: "" }), Payload);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(typeof invalid.message, "string");

  const malformed = await parseJsonBody(request("throw"), Payload);
  assert.equal(malformed.ok, false);

  const valid = await parseJsonBody(request({ name: "Inbox" }), Payload);
  assert.deepEqual(valid, { ok: true, data: { name: "Inbox" } });
});

test("parseUnknown decodes an already-read value", async () => {
  assert.deepEqual(await parseUnknown(Payload, { name: " Inbox " }), {
    ok: true,
    data: { name: "Inbox" },
  });
  assert.equal((await parseUnknown(Payload, { name: "" })).ok, false);
  assert.equal(
    (await parseUnknown(Payload, { name: "Inbox", extra: true }, { onExcessProperty: "error" })).ok,
    false,
  );
});
