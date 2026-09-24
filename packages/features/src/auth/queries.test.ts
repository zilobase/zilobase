import assert from "node:assert/strict";
import test from "node:test";

import type { ZilobaseAuthClient } from "../shared/context";
import { sessionQueryOptions } from "./queries";

test("session queries forward TanStack cancellation", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const auth = {
    getSession: async (signal?: AbortSignal) => {
      receivedSignal = signal;
      return { session: null, user: null };
    },
  } as ZilobaseAuthClient;

  await sessionQueryOptions(auth).queryFn?.({ signal: controller.signal } as never);

  assert.equal(receivedSignal, controller.signal);
});
