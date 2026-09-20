import { AsyncLocalStorage } from "node:async_hooks";
import type { Ports } from "@zilobase/runtime-ports";
import type { ServerRuntimeAdapter } from "./contracts";

let runtimeAdapter: ServerRuntimeAdapter = {};
const runtimeAdapterStore = new AsyncLocalStorage<ServerRuntimeAdapter>();
let runtimePorts: Partial<Ports> = {};
const runtimePortsStore = new AsyncLocalStorage<Partial<Ports>>();

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

export function setRuntimePorts(ports: Partial<Ports>) {
  runtimePorts = ports;
}

export function runWithRuntimePorts<T>(
  ports: Partial<Ports>,
  callback: () => T,
) {
  return runtimePortsStore.run(ports, callback);
}

export function getRuntimePorts() {
  return runtimePortsStore.getStore() ?? runtimePorts;
}
