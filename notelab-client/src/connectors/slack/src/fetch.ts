export type SlackFetch = typeof fetch;

export function resolveFetch(fetchImpl?: SlackFetch): SlackFetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  return fetch;
}
