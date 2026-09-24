export function resolvePageEditability({
  readOnly,
  locked,
  deletedAt,
  accessLevel,
}: {
  readOnly: boolean;
  locked: boolean;
  deletedAt: unknown;
  accessLevel: string | null | undefined;
}) {
  const pageEditable =
    !readOnly && !locked && !deletedAt && (accessLevel === "edit" || accessLevel === "full");
  const commentsEditable =
    !readOnly &&
    !deletedAt &&
    (accessLevel === "comment" || accessLevel === "edit" || accessLevel === "full");
  return { pageEditable, commentsEditable };
}
