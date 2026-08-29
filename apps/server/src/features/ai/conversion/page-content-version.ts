export async function hashPageContentMarkdown(markdown: string) {
  const encoded = new TextEncoder().encode(markdown);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function isPageContentVersionCurrent(input: {
  currentMarkdown: string;
  currentUpdatedAt: string;
  expectedContentHash: string;
  expectedUpdatedAt: string;
}) {
  if (input.currentUpdatedAt === input.expectedUpdatedAt) return true;

  return await hashPageContentMarkdown(input.currentMarkdown) ===
    input.expectedContentHash;
}
