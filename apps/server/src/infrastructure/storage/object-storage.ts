import { Context, Effect, Layer, Schema } from "effect";

import type { RuntimeEnv } from "../../shared/config/config";
import {
  createImageStorage,
  type ImageStorage,
} from "./image-storage";

export class ObjectStorageUnavailable extends Schema.TaggedError<ObjectStorageUnavailable>()(
  "ObjectStorageUnavailable",
  {
    cause: Schema.Unknown,
  },
) {}

export class ObjectStorage extends Context.Service<
  ObjectStorage,
  {
    checkReady(env: RuntimeEnv): Effect.Effect<void, ObjectStorageUnavailable>;
    withEnv<A>(
      env: RuntimeEnv,
      operation: (storage: ImageStorage) => Promise<A>,
    ): Effect.Effect<A, ObjectStorageUnavailable>;
  }
>()("@zilobase/server/infrastructure/storage/ObjectStorage") {
  static readonly layer = Layer.succeed(this, {
    withEnv: <A>(
      env: RuntimeEnv,
      operation: (storage: ImageStorage) => Promise<A>,
    ) =>
      Effect.tryPromise({
        try: () => operation(createImageStorage(env)),
        catch: (cause) => new ObjectStorageUnavailable({ cause }),
      }).pipe(Effect.withSpan("ObjectStorage.withEnv")),
    checkReady: (env: RuntimeEnv) =>
      Effect.tryPromise({
        try: () => checkObjectStorageReady(createImageStorage(env)),
        catch: (cause) => new ObjectStorageUnavailable({ cause }),
      }).pipe(Effect.withSpan("ObjectStorage.checkReady")),
  });
}

async function checkObjectStorageReady(storage: ImageStorage) {
  await storage.checkReady();
}
