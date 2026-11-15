import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { parseJsonBody, parseUnknown } from "./schema-json";

const Payload = z.object({
  name: z.string().trim().min(1),
});

function request(body: unknown) {
  return {
    async json() {
      if (body === "throw") throw new SyntaxError("bad json");
      return body;
    },
  };
}

test("parseJsonBody decodes a valid JSON object", async () => {
  assert.deepEqual(await parseJsonBody(request({ name: " Inbox " }), Payload), {
    ok: true,
    data: { name: "Inbox" },
  });
});

test("parseJsonBody maps schema failures without throwing", async () => {
  const invalid = await parseJsonBody(request({ name: "" }), Payload);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.message, /\n {2}at \["name"\]$/);

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
  assert.equal((await parseUnknown(Payload.strict(), { name: "Inbox", extra: true })).ok, false);
});
