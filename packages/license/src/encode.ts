export function toBase64Url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

export function fromBase64Url(data: string): Buffer {
  return Buffer.from(data, "base64url");
}
