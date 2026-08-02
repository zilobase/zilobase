export function reorderOptionsByIds<TOption extends { id: string }>(
  options: TOption[],
  optionIds: string[],
) {
  const optionsById = new Map(options.map((option) => [option.id, option]));
  const orderedOptions = optionIds.flatMap((optionId) => {
    const option = optionsById.get(optionId);

    return option ? [option] : [];
  });
  const remainingOptions = options.filter(
    (option) => !optionIds.includes(option.id),
  );

  return [...orderedOptions, ...remainingOptions];
}

export function areSameOrderedIds(firstIds: string[], secondIds: string[]) {
  return (
    firstIds.length === secondIds.length &&
    firstIds.every((id, index) => id === secondIds[index])
  );
}

export function haveSameIds(firstIds: string[], secondIds: string[]) {
  if (firstIds.length !== secondIds.length) {
    return false;
  }

  const secondIdSet = new Set(secondIds);

  return firstIds.every((id) => secondIdSet.has(id));
}
