export async function meetingAudioMessageBytes(
  raw: unknown,
): Promise<Uint8Array | null> {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  if (raw instanceof Blob) return new Uint8Array(await raw.arrayBuffer());
  return null;
}
