import { AsyncLocalStorage } from "node:async_hooks";
import type { Ports } from "@zilobase/runtime-ports";
let runtimePorts: Partial<Ports> = {};
const runtimePortsStore = new AsyncLocalStorage<Partial<Ports>>();

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
