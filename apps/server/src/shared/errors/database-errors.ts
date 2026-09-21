const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "53300",
  "57P03",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
]);

const DATABASE_UNAVAILABLE_MESSAGES = [
  "failed to acquire a connection from the pool",
  "remaining connection slots are reserved",
  "server connection attempt failed",
  "connection terminated unexpectedly",
  "connection timeout",
  "timeout expired",
];

export const DATABASE_UNAVAILABLE_CODE = "DATABASE_UNAVAILABLE";
export const DATABASE_UNAVAILABLE_MESSAGE =
  "The database is temporarily unavailable.";

export function isDatabaseUnavailableError(error: unknown) {
  const pending = [error];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as {
      cause?: unknown;
      code?: unknown;
      errors?: unknown;
      message?: unknown;
    };

    if (
      typeof record.code === "string" &&
      DATABASE_UNAVAILABLE_CODES.has(record.code)
    ) {
      return true;
    }

    const errorMessage =
      typeof record.message === "string" ? record.message.toLowerCase() : null;
    if (
      errorMessage &&
      DATABASE_UNAVAILABLE_MESSAGES.some((message) =>
        errorMessage.includes(message),
      )
    ) {
      return true;
    }

    pending.push(record.cause);
    if (Array.isArray(record.errors)) pending.push(...record.errors);
  }

  return false;
}

export function getDatabaseErrorCode(error: unknown) {
  const pending = [error];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as {
      cause?: unknown;
      code?: unknown;
      errors?: unknown;
    };
    if (typeof record.code === "string") return record.code;
    pending.push(record.cause);
    if (Array.isArray(record.errors)) pending.push(...record.errors);
  }

  return null;
}
