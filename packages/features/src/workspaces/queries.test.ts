import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import type { ZilobaseAuthClient } from "../shared/context";
import { workspaceInvitationsQueryOptions, workspacesQueryOptions } from "./queries";

test("workspace list queries survive an observer detaching while a router consumer awaits them", async () => {
  let resolveRequest!: (value: unknown[]) => void;
  let receivedSignal: AbortSignal | undefined;
  const auth = {
    listWorkspaces: async (signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<unknown[]>((resolve) => {
        resolveRequest = resolve;
      });
    },
  } as unknown as ZilobaseAuthClient;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = workspacesQueryOptions(auth);
  const observer = new QueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => {});

  const routeRequest = queryClient.fetchQuery(options);
  unsubscribe();
  resolveRequest([]);

  assert.deepEqual(await routeRequest, []);
  assert.equal(receivedSignal, undefined);
});

test("workspace invitation queries forward TanStack cancellation", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const auth = {
    listWorkspaceInvitations: async (_workspaceId: string, signal?: AbortSignal) => {
      receivedSignal = signal;
      return [];
    },
  } as unknown as ZilobaseAuthClient;

  await workspaceInvitationsQueryOptions(auth, "workspace-1").queryFn?.({
    signal: controller.signal,
  } as never);

  assert.equal(receivedSignal, controller.signal);
});
