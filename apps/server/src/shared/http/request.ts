type JsonBodyRequest = {
  json(): Promise<unknown>;
};

export async function readJsonBody(
  request: JsonBodyRequest,
  fallback: unknown = null,
) {
  try {
    return await request.json();
  } catch {
    return fallback;
  }
}

export function requestSignal(timeoutMs: number, signal?: AbortSignal) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Request timeout must be a positive integer.");
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
