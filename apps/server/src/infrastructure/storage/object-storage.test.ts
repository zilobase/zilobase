import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createImageStorage: vi.fn(),
}));

vi.mock("./image-storage", () => ({
  createImageStorage: mocks.createImageStorage,
}));

import { createAppRuntime } from "../effect";
import { ObjectStorage, ObjectStorageUnavailable } from "./object-storage";

beforeEach(() => {
  mocks.createImageStorage.mockReset();
});

test("ObjectStorage.withEnv runs against the env storage client", async () => {
  const storage = {
    head: vi.fn(async () => ({ byteSize: 1 })),
  };
  mocks.createImageStorage.mockReturnValue(storage);
  const runtime = createAppRuntime(ObjectStorage.layer);

  try {
    const result = await runtime.runPromise(
      ObjectStorage.use((objectStorage) =>
        objectStorage.withEnv({ S3_BUCKET_NAME: "images" }, async (client) => {
          assert.equal(client, storage);
          return "ok";
        }),
      ),
    );
    assert.equal(result, "ok");
    assert.equal(mocks.createImageStorage.mock.calls[0]?.[0].S3_BUCKET_NAME, "images");
  } finally {
    await runtime.dispose();
  }
});

test("ObjectStorage.checkReady delegates to the required storage readiness check", async () => {
  const ready = { checkReady: vi.fn(async () => undefined), head: vi.fn() };
  mocks.createImageStorage.mockReturnValue(ready);
  const runtime = createAppRuntime(ObjectStorage.layer);

  try {
    await runtime.runPromise(
      ObjectStorage.use((objectStorage) => objectStorage.checkReady({})),
    );
    assert.equal(ready.checkReady.mock.calls.length, 1);
    assert.equal(ready.head.mock.calls.length, 0);
  } finally {
    await runtime.dispose();
  }
});

test("ObjectStorage maps client failures to ObjectStorageUnavailable", async () => {
  mocks.createImageStorage.mockReturnValue({
    async checkReady() {
      throw new Error("bucket missing");
    },
  });
  const runtime = createAppRuntime(ObjectStorage.layer);

  try {
    await assert.rejects(
      () =>
        runtime.runPromise(
          ObjectStorage.use((objectStorage) => objectStorage.checkReady({})),
        ),
      (error: unknown) => error instanceof ObjectStorageUnavailable,
    );
  } finally {
    await runtime.dispose();
  }
});
