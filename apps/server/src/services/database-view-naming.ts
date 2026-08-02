export function getNextDatabaseViewName(
  baseName: string,
  existingNames: Set<string>,
) {
  const trimmedName = baseName.trim() || "Table";

  if (!existingNames.has(trimmedName)) {
    return trimmedName;
  }

  let index = 2;
  while (existingNames.has(`${trimmedName} ${index}`)) {
    index += 1;
  }

  return `${trimmedName} ${index}`;
}
