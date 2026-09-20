import type { OutboundFetch } from "@zilobase/runtime-ports";

export function createWorkerOutboundFetch(): OutboundFetch {
  return {
    async fetchWebhook(input) {
      return fetch(input.url, {
        body: input.body,
        headers: input.headers,
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(input.timeoutMs),
        ...({ cf: { resolveOverride: input.pinnedAddress } } as Record<string, unknown>),
      });
    },
    async fetchMcp(input) {
      const timeout = AbortSignal.timeout(input.timeoutMs);
      const signal = input.signal
        ? AbortSignal.any([input.signal, timeout])
        : timeout;
      return fetch(input.url, {
        body: input.body,
        headers: input.headers,
        method: input.method,
        redirect: "manual",
        signal,
      });
    },
  };
}
