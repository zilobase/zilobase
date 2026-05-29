export type GoogleCalendarFetch = typeof fetch;

export function resolveFetch(
  fetchImpl?: GoogleCalendarFetch,
): GoogleCalendarFetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  return (input, init) => globalThis.fetch(input, init);
}
