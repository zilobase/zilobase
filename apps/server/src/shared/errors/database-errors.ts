const DATABASE_UNAVAILABLE_CODES = new Set([
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
  let current = error;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      cause?: unknown;
      code?: unknown;
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

    current = record.cause;
  }

  return false;
}

export function getDatabaseErrorCode(error: unknown) {
  let current = error;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { cause?: unknown; code?: unknown };
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }

  return null;
}
