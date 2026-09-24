export type RequestInterception = { handled: false } | { handled: true; value: unknown };

export type RequestObservation =
  | { type: "response"; status: number }
  | { type: "network-error"; error: unknown };

/** Application policy runs around transport; failures may reject the request. */
export type RequestPolicy = {
  intercept(path: string, method: string, body: BodyInit | null | undefined): RequestInterception;
  observe(event: RequestObservation): void;
  transformResponse(path: string, value: unknown): unknown;
};

const browserPolicy: RequestPolicy = {
  intercept: () => ({ handled: false }),
  observe: () => undefined,
  transformResponse: (_path, value) => value,
};

let policy = browserPolicy;

export function installRequestPolicy(next: RequestPolicy) {
  policy = next;
}

export function getRequestPolicy() {
  return policy;
}
