import { AsyncLocalStorage } from "node:async_hooks";
import type { ServerRuntimeAdapter } from "./contracts";

let runtimeAdapter: ServerRuntimeAdapter = {};
const runtimeAdapterStore = new AsyncLocalStorage<ServerRuntimeAdapter>();

export function setRuntimeAdapter(adapter: ServerRuntimeAdapter) {
  runtimeAdapter = adapter;
}

export function runWithRuntimeAdapter<T>(
  adapter: ServerRuntimeAdapter,
  callback: () => T,
) {
  return runtimeAdapterStore.run(adapter, callback);
}

export function getRuntimeAdapter() {
  return runtimeAdapterStore.getStore() ?? runtimeAdapter;
}
