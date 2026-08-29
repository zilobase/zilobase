import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const aws = vi.hoisted(() => ({
  clients: [] as unknown[],
  getSignedUrl: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(readonly input: unknown) {}
  }

  return {
    DeleteObjectCommand: Command,
    GetObjectCommand: Command,
    HeadBucketCommand: Command,
    HeadObjectCommand: Command,
    PutObjectCommand: Command,
    S3Client: class {
      constructor(readonly options: unknown) {
        aws.clients.push(this);
      }
      send = aws.send;
    },
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: aws.getSignedUrl,
}));

import {
  createImageStorage,
  createS3ImageStorage,
  resolveImageStorageMode,
  type ImageStorage,
} from "./image-storage";
import { runWithRuntimeAdapter } from "../runtime/runtime-adapter";

const s3Env = {
  S3_ACCESS_KEY_ID: "access-key",
  S3_BUCKET_NAME: "images",
  S3_ENDPOINT: "https://s3.example.com",
  S3_SECRET_ACCESS_KEY: "secret-key",
};

beforeEach(() => {
  aws.clients.length = 0;
  aws.getSignedUrl.mockReset();
  aws.getSignedUrl.mockResolvedValue("https://signed.example.com/object");
  aws.send.mockReset();
});

test("S3 signs browser URLs with the public endpoint and keeps an internal client", async () => {
  const storage = createS3ImageStorage({
    ...s3Env,
    S3_PUBLIC_ENDPOINT: "https://objects.example.com",
  });

  await storage.createUploadUrl({
    byteSize: 12,
    contentType: "image/png",
    expiresInSeconds: 60,
    objectKey: "workspace/image.png",
  });

  assert.equal(aws.clients.length, 2);
  assert.equal(
    (aws.clients[0] as { options: { endpoint: string } }).options.endpoint,
    s3Env.S3_ENDPOINT,
  );
  assert.equal(
    (aws.clients[1] as { options: { endpoint: string } }).options.endpoint,
    "https://objects.example.com",
  );
  assert.equal(aws.getSignedUrl.mock.calls[0]?.[0], aws.clients[1]);

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  assert.equal(await storage.get("workspace/image.png"), null);
  assert.equal(aws.getSignedUrl.mock.calls[1]?.[0], aws.clients[0]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("runtime storage overrides S3 and mode resolution has stable fallbacks", () => {
  const adapterStorage = { mode: "binding" } as ImageStorage;

  runWithRuntimeAdapter(
    {
      createImageStorage: () => adapterStorage,
      getImageStorageMode: () => "binding",
    },
    () => {
      assert.equal(createImageStorage({}), adapterStorage);
      assert.equal(resolveImageStorageMode({}), "binding");
    },
  );

  assert.equal(resolveImageStorageMode({}), "s3");
  assert.equal(resolveImageStorageMode({ IMAGE_STORAGE_MODE: "s3" }), "s3");
});

test("S3 storage reports every missing configuration value", () => {
  assert.throws(
    () => createS3ImageStorage({}),
    /S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_ENDPOINT/,
  );
});

test("S3 storage creates upload and safe inline read URLs", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
  const storage = createS3ImageStorage(s3Env);

  assert.deepEqual(
    await storage.createUploadUrl({
      byteSize: 12,
      contentType: "image/png",
      expiresInSeconds: 60,
      objectKey: "workspace/image.png",
    }),
    {
      expiresAt: "2026-08-02T00:01:00.000Z",
      headers: { "Content-Type": "image/png" },
      method: "PUT",
      storageMode: "s3",
      url: "https://signed.example.com/object",
    },
  );
  assert.deepEqual(aws.getSignedUrl.mock.calls[0]?.[1].input, {
    Bucket: "images",
    ContentType: "image/png",
    Key: "workspace/image.png",
  });
  assert.deepEqual(aws.getSignedUrl.mock.calls[0]?.[2], { expiresIn: 60 });

  await storage.createReadUrl({
    expiresInSeconds: 30,
    filename: "unsafe\"\\\r\nname.png",
    objectKey: "workspace/image.png",
  });
  assert.deepEqual(aws.getSignedUrl.mock.calls[1]?.[1].input, {
    Bucket: "images",
    Key: "workspace/image.png",
    ResponseContentDisposition: 'inline; filename="unsafe____name.png"',
  });

  await storage.createReadUrl({
    expiresInSeconds: 30,
    objectKey: "workspace/image.png",
  });
  assert.equal(
    aws.getSignedUrl.mock.calls[2]?.[1].input.ResponseContentDisposition,
    undefined,
  );
});

test("S3 delete and head operations map SDK responses", async () => {
  const uploadedAt = new Date("2026-08-02T00:00:00.000Z");
  const storage = createS3ImageStorage(s3Env);
  aws.send.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
    ContentLength: 42,
    ContentType: "image/webp",
    ETag: "etag",
    LastModified: uploadedAt,
  });

  await storage.delete("image-key");
  assert.deepEqual(aws.send.mock.calls[0]?.[0].input, {
    Bucket: "images",
    Key: "image-key",
  });
  assert.deepEqual(await storage.head("image-key"), {
    byteSize: 42,
    contentType: "image/webp",
    etag: "etag",
    uploadedAt,
  });
});

test("S3 readiness verifies that the configured bucket is accessible", async () => {
  const storage = createS3ImageStorage(s3Env);
  aws.send.mockResolvedValueOnce(undefined);

  await storage.checkReady?.();

  assert.deepEqual(aws.send.mock.calls[0]?.[0].input, {
    Bucket: "images",
  });
});

test("S3 head treats both not-found shapes as absent and rethrows failures", async () => {
  const storage = createS3ImageStorage(s3Env);
  aws.send
    .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
    .mockRejectedValueOnce({ name: "NotFound" })
    .mockRejectedValueOnce(new Error("S3 unavailable"))
    .mockRejectedValueOnce("non-object failure");

  assert.equal(await storage.head("missing-metadata"), null);
  assert.equal(await storage.head("missing-name"), null);
  await assert.rejects(storage.head("failure"), /S3 unavailable/);
  try {
    await storage.head("non-object");
    assert.fail("expected the non-object failure to be rethrown");
  } catch (error) {
    assert.equal(error, "non-object failure");
  }
});

test("S3 reads map response metadata, absence, and invalid responses", async () => {
  const storage = createS3ImageStorage(s3Env);
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("failure", { status: 503 }))
      .mockResolvedValueOnce(
        new Response("image", {
          headers: {
            "content-length": "5",
            "content-type": "image/png",
            etag: "etag",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          headers: { "content-length": "invalid" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1])),
      ),
  );

  assert.equal(await storage.get("missing"), null);
  await assert.rejects(storage.get("failure"), /Unable to read image object: 503/);
  const object = await storage.get("image-key");
  assert.equal(object?.byteSize, 5);
  assert.equal(object?.contentType, "image/png");
  assert.equal(object?.etag, "etag");
  assert.ok(object?.body);
  const noMetadata = await storage.get("no-metadata");
  assert.equal(noMetadata?.byteSize, undefined);
  assert.equal(noMetadata?.contentType, undefined);
  assert.equal(noMetadata?.etag, undefined);
  assert.equal((await storage.get("no-content-length"))?.byteSize, undefined);
});

test("direct S3 uploads are rejected in favor of presigned URLs", async () => {
  const storage = createImageStorage(s3Env);

  await assert.rejects(
    storage.putObject({
      body: new Blob(["image"]),
      contentType: "image/png",
      objectKey: "image-key",
    }),
    /Direct server uploads are only supported in binding mode/,
  );
});
