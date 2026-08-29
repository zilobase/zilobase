export function lastMatchingIndex<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index]!, index)) {
      return index;
    }
  }

  return -1;
}
