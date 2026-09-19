import type { RuntimeKind } from "./resolve";

export async function loadRuntime(
  kind: RuntimeKind,
): Promise<typeof import("./node/index") | typeof import("./worker/index")> {
  if (kind === "worker") {
    return import("./worker/index");
  }
  return import("./node/index");
}
