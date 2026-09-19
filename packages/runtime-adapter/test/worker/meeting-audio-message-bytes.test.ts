import { describe, expect, it } from "vitest";

import { meetingAudioMessageBytes } from "../../src/worker/features/meeting-audio/message-bytes";

describe("meetingAudioMessageBytes", () => {
  it("reads Cloudflare Blob WebSocket messages", async () => {
    const bytes = await meetingAudioMessageBytes(
      new Blob([new Uint8Array([1, 2, 3])]),
    );

    expect([...bytes ?? []]).toEqual([1, 2, 3]);
  });

  it("preserves ArrayBuffer and sliced typed-array boundaries", async () => {
    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;

    expect([...await meetingAudioMessageBytes(buffer) ?? []]).toEqual([0, 1, 2, 3]);
    expect([
      ...await meetingAudioMessageBytes(new Uint8Array(buffer, 1, 2)) ?? [],
    ]).toEqual([1, 2]);
  });

  it("rejects text and unsupported payloads", async () => {
    await expect(meetingAudioMessageBytes("audio")).resolves.toBeNull();
    await expect(meetingAudioMessageBytes(null)).resolves.toBeNull();
  });
});
