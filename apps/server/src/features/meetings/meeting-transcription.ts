import type { RuntimeEnv } from "../../config";

const PCM_BYTES_PER_SECOND = 24_000 * 2;

export async function transcribeMeetingPcm(
  pcm: Uint8Array,
  env: RuntimeEnv,
) {
  const apiKey = env.OPENAI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error("OPENAI_API_KEY is required for meeting transcription");
  }
  const wav = pcmToWav(pcm);
  const fileBytes = new ArrayBuffer(wav.byteLength);
  new Uint8Array(fileBytes).set(wav);
  const form = new FormData();
  form.set("file", new Blob([fileBytes], { type: "audio/wav" }), "meeting.wav");
  form.set(
    "model",
    typeof env.OPENAI_TRANSCRIPTION_MODEL === "string"
      ? env.OPENAI_TRANSCRIPTION_MODEL
      : "gpt-4o-mini-transcribe",
  );
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    body: form,
    headers: { Authorization: `Bearer ${apiKey}` },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Meeting transcription provider returned ${response.status}`);
  }
  const payload = await response.json() as { text?: unknown };
  if (typeof payload.text !== "string") {
    throw new Error("Meeting transcription provider returned an invalid response");
  }
  return payload.text;
}

export function pcmToWav(pcm: Uint8Array) {
  const result = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(result.buffer);
  result.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 36 + pcm.byteLength, true);
  result.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24_000, true);
  view.setUint32(28, PCM_BYTES_PER_SECOND, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  result.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, pcm.byteLength, true);
  result.set(pcm, 44);
  return result;
}
