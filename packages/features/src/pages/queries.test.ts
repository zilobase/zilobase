import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

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
  resolveRequest({
    page: {
      id: "page-1",
      name: "Page",
      type: "document",
      workspaceId: "workspace-1",
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
  resolveRequest({ pages: [] });

  assert.deepEqual(await routeRequest, { databases: [], pages: [], placements: [] });
  assert.equal(receivedSignal, undefined);
});
