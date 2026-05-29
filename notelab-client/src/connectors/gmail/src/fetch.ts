export type GmailFetch = typeof fetch;

export function resolveFetch(fetchImpl?: GmailFetch): GmailFetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  return (input, init) => globalThis.fetch(input, init);
}
