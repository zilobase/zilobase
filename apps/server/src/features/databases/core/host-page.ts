export const isDatabaseHostPageId = (
  candidatePageId: unknown,
  databasePageId: string | null,
) =>
  typeof candidatePageId === "string" &&
  candidatePageId.length > 0 &&
  candidatePageId === databasePageId;
