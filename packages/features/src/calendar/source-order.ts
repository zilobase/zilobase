export function orderCalendarSources<T>(
  items: readonly T[],
  order: readonly string[],
  key: (item: T) => string,
): T[] {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const left = ranks.get(key(a)),
      right = ranks.get(key(b));
    if (left === undefined && right === undefined) return key(a).localeCompare(key(b));
    return (left ?? Infinity) - (right ?? Infinity);
  });
}

/** Reorder siblings without discarding saved positions belonging to another account. */
export function moveCalendarSource(
  order: readonly string[],
  siblings: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] {
  const ordered = orderCalendarSources([...new Set(siblings)], order, (key) => key);
  const index = ordered.indexOf(id),
    destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ordered.length) return [...order];
  [ordered[index], ordered[destination]] = [ordered[destination]!, ordered[index]!];
  const siblingIds = new Set(siblings);
  return [...order.filter((key) => !siblingIds.has(key)), ...ordered];
}
