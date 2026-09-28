/** Validate against all source rows on the server; loaded rows provide the client preview. */
export function changeRecordHierarchy(input: {
  rowId: string;
  parentRowId: string | null;
  parentPropertyId: string;
  subItemPropertyId: string;
  rows: Array<{ id: string; pageId: string }>;
  values: Array<{ pageId: string; propertyId: string; value: unknown }>;
}) {
  const row = input.rows.find(({ id }) => id === input.rowId);
  const parent = input.rows.find(({ id }) => id === input.parentRowId);
  if (!row || (input.parentRowId && !parent) || row.id === parent?.id) {
    throw new Error("Invalid parent row");
  }
  const pageIds = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : typeof value === "string" && value
        ? [value]
        : [];
  const children = new Map<string, Set<string>>();
  const add = (parentId: string, childId: string) => {
    const ids = children.get(parentId) ?? new Set<string>();
    ids.add(childId);
    children.set(parentId, ids);
  };
  for (const value of input.values) {
    if (value.propertyId === input.parentPropertyId)
      for (const id of pageIds(value.value)) add(id, value.pageId);
    if (value.propertyId === input.subItemPropertyId)
      for (const id of pageIds(value.value)) add(value.pageId, id);
  }
  const pending = [row.pageId];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === parent?.pageId) throw new Error("A row cannot be nested under its descendant");
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  const result = [
    {
      rowId: row.id,
      pageId: row.pageId,
      propertyId: input.parentPropertyId,
      value: parent ? [parent.pageId] : [],
    },
  ];
  for (const candidate of input.rows) {
    const current = pageIds(
      input.values.find(
        (value) =>
          value.pageId === candidate.pageId && value.propertyId === input.subItemPropertyId,
      )?.value,
    );
    const value = current.filter((id) => id !== row.pageId);
    if (candidate.id === parent?.id) value.push(row.pageId);
    if (JSON.stringify(value) !== JSON.stringify(current))
      result.push({
        rowId: candidate.id,
        pageId: candidate.pageId,
        propertyId: input.subItemPropertyId,
        value,
      });
  }
  return result;
}
