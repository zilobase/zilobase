import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import type { ZilobaseAuthClient } from "../shared/context";
import { sessionQueryOptions } from "./queries";

test("session queries survive an observer detaching while a router consumer awaits them", async () => {
  let resolveRequest!: (value: { session: null; user: null }) => void;
  let receivedSignal: AbortSignal | undefined;
  const auth = {
    getSession: async (signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<{ session: null; user: null }>((resolve) => {
        resolveRequest = resolve;
      });
    },
  } as ZilobaseAuthClient;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = sessionQueryOptions(auth);
  const observer = new QueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => {});

  const routeRequest = queryClient.fetchQuery(options);
  unsubscribe();
  resolveRequest({ session: null, user: null });

  assert.deepEqual(await routeRequest, { session: null, user: null });
  assert.equal(receivedSignal, undefined);
});
