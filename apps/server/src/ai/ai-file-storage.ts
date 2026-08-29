import type { RuntimeEnv } from "../shared/config/config";
import {
  createImageStorage,
  type ImageStorage,
  type StoredImageObject,
} from "../infrastructure/storage/image-storage";

export async function readAiStoredObject(
  storage: ImageStorage,
  objectKey: string,
  maxBytes: number,
) {
  const metadata = await storage.head(objectKey);
  if (!metadata) throw new Error("Stored file was not found.");
  if (metadata.byteSize !== undefined && metadata.byteSize > maxBytes) {
    throw new Error("Stored file exceeds the allowed size.");
  }

  const object = await storage.get(objectKey);
  if (!object) throw new Error("Stored file was not found.");
  const bytes = await readBoundedStream(object, maxBytes);
  return { bytes, metadata };
}

export async function putAiStoredObject(input: {
  body: Uint8Array;
  contentType: string;
  env: RuntimeEnv;
  objectKey: string;
}) {
  const storage = createImageStorage(input.env);
  if (storage.mode === "binding") {
    await storage.putObject({
      body: input.body.buffer.slice(
        input.body.byteOffset,
        input.body.byteOffset + input.body.byteLength,
      ) as ArrayBuffer,
      contentType: input.contentType,
      objectKey: input.objectKey,
    });
    return;
  }

  const target = await storage.createUploadUrl({
    byteSize: input.body.byteLength,
    contentType: input.contentType,
    expiresInSeconds: 60,
    objectKey: input.objectKey,
  });
  const response = await fetch(target.url, {
    body: toArrayBuffer(input.body),
    headers: target.headers,
    method: target.method,
  });
  if (!response.ok) {
    throw new Error(`Artifact storage rejected the upload (${response.status}).`);
  }
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function sanitizeAiFilename(value: string, fallback = "file") {
  const leaf = value.replaceAll("\\", "/").split("/").at(-1) ?? fallback;
  const safe = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N} ._()\-]/gu, "_")
    .trim()
    .slice(0, 180);
  return safe || fallback;
}

async function readBoundedStream(object: StoredImageObject, maxBytes: number) {
  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Stored file exceeds the allowed size.");
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
