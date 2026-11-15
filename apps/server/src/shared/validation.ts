import type { z } from "zod";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Report the first issue with its JSON path, matching the previous validation error format. */
export function formatValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return error.message;
  if (!issue.path.length) return issue.message;
  return `${issue.message}\n  at ${issue.path.map((key) => `[${JSON.stringify(key)}]`).join("")}`;
}

export async function parseUnknown<S extends z.ZodType>(
  schema: S,
  input: unknown,
): Promise<ParseResult<z.output<S>>> {
  const result = await schema.safeParseAsync(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, message: formatValidationError(result.error) };
}

/** Preserve deferred JSON decoding so authorization still precedes body validation. */
export async function parseOperationBody<S extends z.ZodType>(
  schema: S,
  read: () => Promise<unknown>,
) {
  const body = await read().catch(() => null);
  return parseUnknown(schema, body);
}
