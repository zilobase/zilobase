import assert from "node:assert/strict";
import { test } from "vitest";

import { pcmToWav } from "./meeting-transcription";

test("PCM frames are wrapped as 24 kHz mono WAV for transcription", () => {
  const wav = pcmToWav(Uint8Array.from([1, 2, 3, 4]));
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 24_000);
  assert.equal(new DataView(wav.buffer).getUint16(22, true), 1);
  assert.deepEqual([...wav.subarray(44)], [1, 2, 3, 4]);
});
