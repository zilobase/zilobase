import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ZilobaseFeaturesProvider, type ZilobaseFeaturesConfig } from "./context";
import { DbProvider } from "../databases/client/provider";

// Render the real hook once, then exercise its MutationObserver through mutateAsync.
// These mutations do not use authentication; fail immediately if that changes.
export function createMutationTestRuntime<T>(
  useHook: () => T,
  apiFetch: ZilobaseFeaturesConfig["apiFetch"],
) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let mutation: T | undefined;
  function Capture() { mutation = useHook(); return null; }
  const auth = new Proxy({} as ZilobaseFeaturesConfig["auth"], {
    get() { throw new Error("Unexpected authentication call in mutation test"); },
  });
  renderToString(createElement(QueryClientProvider, { client: queryClient },
    createElement(ZilobaseFeaturesProvider, { value: { apiFetch, queryClient, auth } },
      createElement(DbProvider, { apiFetch, queryClient, sessionId: "test-session" },
        createElement(Capture)))));
  if (!mutation) throw new Error("Hook did not render");
  return { mutation, queryClient };
}

import assert from "node:assert/strict";
import test from "node:test";
import { useZilobaseFeatures } from "./context";

test("feature hooks reject composition without a feature provider", () => {
  function Unconfigured() { useZilobaseFeatures(); return null; }
  assert.throws(() => renderToString(createElement(Unconfigured)), /ZilobaseFeaturesProvider is missing/);
});
