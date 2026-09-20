import type { Documents } from "@zilobase/runtime-ports";
import type { WorkerEnvBindings } from "./bindings";

export function createWorkerDocuments(env: WorkerEnvBindings): Documents {
  return {
    async appendPageComment(input) {
      const namespace = env.PAGE_COLLABORATION;
      if (!namespace) throw new Error("PAGE_COLLABORATION binding is required");
      return namespace.getByName(`page:${input.pageId}`).appendPageComment(input);
    },
  };
}
