import type {
  ImageStorage,
  ImageStorageMode,
  StoredObjectMetadata,
} from "@zilobase/runtime-ports";

import type { RuntimeEnv } from "../../shared/config/config";
import { requireRuntimePort } from "@zilobase/runtime-adapter/capabilities";

export type StoredImageObject = StoredObjectMetadata & { body: ReadableStream };
export type StoredImageMetadata = StoredObjectMetadata;
export type CreateUploadUrlOptions = Parameters<ImageStorage["createUploadUrl"]>[0];
export type CreateReadUrlOptions = Parameters<ImageStorage["createReadUrl"]>[0];
export type PutObjectOptions = Parameters<ImageStorage["putObject"]>[0];
export type ImageUploadTarget = Awaited<ReturnType<ImageStorage["createUploadUrl"]>>;
export type { ImageStorage, ImageStorageMode };

export function createImageStorage(env: RuntimeEnv): ImageStorage {
  void env;
  return requireRuntimePort("blobs");
}

export function resolveImageStorageMode(env: RuntimeEnv): ImageStorageMode {
  return createImageStorage(env).mode;
}
