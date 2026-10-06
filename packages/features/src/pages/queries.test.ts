import assert from "node:assert/strict";
import test from "node:test";
import { QueryObserver } from "@tanstack/react-query";
import { TestQueryClient as QueryClient } from "../data/testing";

import type { ApiFetcher } from "../shared/api-fetcher";
import { pageQueryOptions, pagesQueryOptions } from "./queries";

test("route-owned page queries survive their component observer detaching", async () => {
  let resolveRequest!: (value: unknown) => void;
  let receivedSignal: AbortSignal | null | undefined;
  const apiFetch = (<T>(_path: string, init?: RequestInit) => {
    receivedSignal = init?.signal;
    return new Promise<T>((resolve) => {
      resolveRequest = resolve as (value: unknown) => void;
    });
  }) as ApiFetcher;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = pageQueryOptions(apiFetch, "page-1");
  const observer = new QueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => {});

  const routeRequest = queryClient.fetchQuery(options);
  unsubscribe();
  await new Promise<void>((resolve) => setImmediate(resolve));
  resolveRequest({
    page: {
      id: "page-1",
      name: "Page",
      type: "document",
      workspaceId: "workspace-1",
      updatedAt: "2026-10-05T00:00:00.000Z",
    },
  });

  assert.equal((await routeRequest)?.page.id, "page-1");
  assert.equal(receivedSignal, undefined);
});

test("route-owned navigation queries survive their component observer detaching", async () => {
  let resolveRequest!: (value: unknown) => void;
  let receivedSignal: AbortSignal | null | undefined;
  const apiFetch = (<T>(_path: string, init?: RequestInit) => {
    receivedSignal = init?.signal;
    return new Promise<T>((resolve) => {
      resolveRequest = resolve as (value: unknown) => void;
    });
  }) as ApiFetcher;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = pagesQueryOptions(apiFetch, "workspace-1");
  const observer = new QueryObserver(queryClient, options);
  const unsubscribe = observer.subscribe(() => {});

  const routeRequest = queryClient.fetchQuery(options);
  unsubscribe();
  await new Promise<void>((resolve) => setImmediate(resolve));
  resolveRequest({ pages: [] });

  assert.deepEqual(await routeRequest, { databases: [], pages: [], placements: [] });
  assert.equal(receivedSignal, undefined);
});
