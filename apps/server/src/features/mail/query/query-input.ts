import { normalizeMailFilterExpression } from "@zilobase/features/mail/organization";

type QueryBody = Record<string, unknown> & { routeId: string };

export function isGroupedQueryBody(body: Record<string, unknown> | null): body is QueryBody {
  if (!body || typeof body.routeId !== "string" || !body.routeId || body.routeId.length > 200)
    return false;
  if (body.filter !== undefined && (!body.filter || typeof body.filter !== "object")) return false;
  return optionalString(body.search, 500);
}

export function isIndexedQueryBody(body: Record<string, unknown> | null): body is QueryBody {
  if (!isGroupedQueryBody(body)) return false;
  if (!optionalString(body.cursor) || !optionalString(body.groupKey, 500)) return false;
  return (
    body.limit === undefined ||
    (Number.isInteger(body.limit) && Number(body.limit) >= 1 && Number(body.limit) <= 100)
  );
}

function optionalString(value: unknown, maximum = Infinity) {
  return value === undefined || (typeof value === "string" && value.length <= maximum);
}

export function groupedQueryOptions(body: QueryBody) {
  return {
    routeId: body.routeId,
    ...(body.filter !== undefined ? { filter: normalizeMailFilterExpression(body.filter) } : {}),
    ...(typeof body.search === "string" ? { search: body.search } : {}),
  };
}

export function indexedQueryOptions(body: QueryBody) {
  return {
    ...groupedQueryOptions(body),
    ...(typeof body.cursor === "string" ? { cursor: body.cursor } : {}),
    ...(typeof body.groupKey === "string" ? { groupKey: body.groupKey } : {}),
    ...(typeof body.limit === "number" ? { limit: body.limit } : {}),
  };
}
