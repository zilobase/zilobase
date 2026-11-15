import type { z } from "zod";

import { parseUnknown } from "../../shared/validation";
import { readJsonBody } from "./request";

type JsonBodyRequest = {
  json(): Promise<unknown>;
};

export { parseUnknown } from "../../shared/validation";

export async function parseJsonBody<S extends z.ZodType>(request: JsonBodyRequest, schema: S) {
  return parseUnknown(schema, await readJsonBody(request));
}
