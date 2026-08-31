function normalizePageTitle(value: string) {
  return value
    .replace(/[*_~`]/g, "")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function stripDuplicatePageTitleHeadings(
  markdown: string,
  pageTitle: string,
) {
  const normalizedTitle = normalizePageTitle(pageTitle);
  if (!normalizedTitle) return markdown;

  return markdown
    .split("\n")
    .filter((line) => {
      const heading = line.trim().match(/^#{1,6}\s+(.+)$/);
      return !heading || normalizePageTitle(heading[1]!) !== normalizedTitle;
    })
    .join("\n")
    .replace(/^\s*\n/, "")
    .trimEnd();
}
