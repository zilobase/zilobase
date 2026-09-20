import { AsyncLocalStorage } from "node:async_hooks";
import type { Ports } from "@zilobase/runtime-ports";
const runtimePortsStore = new AsyncLocalStorage<Partial<Ports>>();

export function runWithRuntimePorts<T>(
  ports: Partial<Ports>,
  callback: () => T,
) {
  return runtimePortsStore.run(ports, callback);
}

export function getRuntimePorts() {
  const ports = runtimePortsStore.getStore();
  if (!ports) throw new Error("Runtime ports context is required");
  return ports;
}
