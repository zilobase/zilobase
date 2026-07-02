import { getRequiredStringEnv, getStringEnv, type RuntimeEnv } from "./config";
import type { ImageStorage } from "./image-storage";

export type ServerRuntimeAdapter = {
  createImageStorage?(env: RuntimeEnv): ImageStorage | null;
  getDatabaseUrl?(env: RuntimeEnv): string | null | undefined;
  getImageStorageMode?(env: RuntimeEnv): "s3" | "binding" | null | undefined;
};

let runtimeAdapter: ServerRuntimeAdapter = {};

export function setRuntimeAdapter(adapter: ServerRuntimeAdapter) {
  runtimeAdapter = adapter;
}

export function getDatabaseUrl(env: RuntimeEnv) {
  const adapterUrl = runtimeAdapter.getDatabaseUrl?.(env);

  if (adapterUrl) {
    return adapterUrl;
  }

  return getRequiredStringEnv(env, "DATABASE_URL");
}

export function getRuntimeAdapter() {
  return runtimeAdapter;
}

export function getConfiguredImageStorageMode(env: RuntimeEnv) {
  const configured = getStringEnv(env, "IMAGE_STORAGE_MODE");

  if (!configured) {
    return null;
  }

  if (configured === "s3" || configured === "binding") {
    return configured;
  }

  throw new Error("IMAGE_STORAGE_MODE must be either 's3' or 'binding'");
}
