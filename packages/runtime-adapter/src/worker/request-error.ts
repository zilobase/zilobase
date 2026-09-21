import {
  DATABASE_UNAVAILABLE_CODE,
  DATABASE_UNAVAILABLE_MESSAGE,
  getDatabaseErrorCode,
  isDatabaseUnavailableError,
} from "@zilobase/server/adapter-api";

export function createWorkerDatabaseUnavailableResponse(
  error: unknown,
  request: Request,
) {
  if (!isDatabaseUnavailableError(error)) return null;

  const code = getDatabaseErrorCode(error) ?? DATABASE_UNAVAILABLE_CODE;
  const requestId = request.headers.get("x-zilobase-request-id");
  const route = new URL(request.url).pathname;

  console.error(JSON.stringify({
    code,
    error: error instanceof Error ? error.message : String(error),
    event: "database_connection_failed",
    requestId,
    route,
  }));

  return Response.json(
    {
      code: DATABASE_UNAVAILABLE_CODE,
      message: DATABASE_UNAVAILABLE_MESSAGE,
    },
    {
      headers: {
        "Retry-After": "5",
        ...(requestId ? { "x-zilobase-request-id": requestId } : {}),
      },
      status: 503,
    },
  );
}
