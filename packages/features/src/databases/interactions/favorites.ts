import type { PageNavigationPayload } from "../../pages/contracts";
export function isNavigationSnapshot(value: unknown): value is PageNavigationPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PageNavigationPayload>;
  return (
    Array.isArray(candidate.databases) &&
    Array.isArray(candidate.pages) &&
    Array.isArray(candidate.placements)
  );
}
