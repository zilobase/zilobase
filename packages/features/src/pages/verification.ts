import { z } from "zod";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { contentVerificationSchema } from "../search/controls";
import { sharedClient } from "../data/client";
import type { ApiFetcher } from "../shared/api-fetcher";
export type VerificationResource = { workspaceId: string; type: "page" | "database"; id: string };
export type VerificationChange = { expiresAt: string | null } | { remove: true };
const responseSchema = z.object({
  workspaceId: z.string(),
  type: z.enum(["page", "database"]),
  id: z.string(),
  verification: contentVerificationSchema,
  canManage: z.boolean(),
});
export type VerificationResponse = z.output<typeof responseSchema>;
export const contentVerificationQueryKey = (resource: VerificationResource | null) =>
  [
    "content-verification",
    resource?.workspaceId ?? "none",
    resource?.type ?? "none",
    resource?.id ?? "none",
  ] as const;
const path = (resource: VerificationResource) =>
  `/${resource.type === "page" ? "pages" : "databases"}/${encodeURIComponent(resource.id)}/verification`;
function parseResponse(input: unknown, resource: VerificationResource) {
  const result = responseSchema.parse(input);
  if (
    result.workspaceId !== resource.workspaceId ||
    result.type !== resource.type ||
    result.id !== resource.id
  )
    throw new Error("Verification response scope mismatch");
  return result;
}
export function contentVerificationQueryOptions(
  apiFetch: ApiFetcher,
  resource: VerificationResource | null,
  enabled = true,
) {
  return queryOptions({
    queryKey: contentVerificationQueryKey(resource),
    enabled: Boolean(resource) && enabled,
    staleTime: 0,
    queryFn: async ({ client, signal }) => {
      if (!resource) throw new Error("Content is required");
      const owner = sharedClient(client),
        read = await owner.captureRead();
      const result = await apiFetch(path(resource), { method: "GET", signal });
      owner.resolve(read, resource.workspaceId);
      return parseResponse(result, resource);
    },
  });
}
export async function changeContentVerification(
  client: QueryClient,
  apiFetch: ApiFetcher,
  resource: VerificationResource,
  change: VerificationChange,
) {
  const target = { ...resource },
    owner = sharedClient(client),
    read = await owner.captureRead();
  const result = await apiFetch(
    path(target),
    "remove" in change
      ? { method: "DELETE" }
      : {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        },
  );
  owner.resolve(read, target.workspaceId);
  return { response: parseResponse(result, target), read, resource: target };
}
export async function reconcileContentVerification(
  client: QueryClient,
  result: Awaited<ReturnType<typeof changeContentVerification>>,
) {
  if (!sharedClient(client).isCurrent(result.read)) return;
  client.setQueryData<VerificationResponse>(
    contentVerificationQueryKey(result.resource),
    (previous) => {
      const incoming = result.response.verification.revision,
        existing = previous?.verification.revision;
      return existing && incoming && existing > incoming ? previous : result.response;
    },
  );
  await client.invalidateQueries({ queryKey: ["search", result.resource.workspaceId] });
  if (!sharedClient(client).isCurrent(result.read)) return;
  await client.invalidateQueries({ queryKey: contentVerificationQueryKey(result.resource) });
}
