import { validator } from "hono/validator";
import type { ZodType } from "zod";

export const JSON_CONTENT_TYPE = "application/json";
/** Maximum JSON request size accepted by legacy Zod-backed routes. */
export const JSON_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

export function hasJsonContentType(contentType: string | undefined) {
  return Boolean(contentType?.toLowerCase().includes(JSON_CONTENT_TYPE));
}

export function jsonValidator<T extends ZodType>(schema?: T) {
  return validator("json", (value, c) => {
    if (!hasJsonContentType(c.req.header("content-type"))) {
      return c.json({ error: "A JSON body is required" }, 400);
    }

    if (!schema) {
      if (!value || typeof value !== "object") {
        return c.json({ error: "A JSON body is required" }, 400);
      }
      return value;
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        {
          code: "VALIDATION_ERROR",
          error: "Invalid request body",
          issues: parsed.error.issues,
        },
        400,
      );
    }
    return parsed.data;
  });
}

export function jsonContentTypeHeaders() {
  return { "Content-Type": JSON_CONTENT_TYPE } satisfies HeadersInit;
}
