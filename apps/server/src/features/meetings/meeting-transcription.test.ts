import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { transcribeMeetingPcm } from "./meeting-transcription";

afterEach(() => vi.unstubAllGlobals());

test("transcription trims injected credentials", async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ text: "Hello" }));
  vi.stubGlobal("fetch", request);

  await assert.doesNotReject(() =>
    transcribeMeetingPcm(new Uint8Array(48), {
      OPENAI_API_KEY: "  valid-key\n",
    })
  );
  assert.deepEqual(request.mock.calls[0]?.[1]?.headers, {
    Authorization: "Bearer valid-key",
  });
});

test("transcription errors expose provider codes without provider messages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    error: {
      code: "invalid_api_key",
      message: "Incorrect key: secret-value",
      type: "invalid_request_error",
    },
  }, { status: 401 })));

  await assert.rejects(
    () => transcribeMeetingPcm(new Uint8Array(48), { OPENAI_API_KEY: "key" }),
    (error: unknown) => {
      assert.match(String(error), /401 \(invalid_api_key\)/);
      assert.doesNotMatch(String(error), /secret-value/);
      return true;
    },
  );
});
