import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SessionEntities } from "../data/client";
import { databaseMutationEventV2Schema, type DatabaseMutationEventV2 } from "./core/entities";
import { reconcileBootstrapReferences } from "./cache-references";

/** Each existing capability independently proves admission; private receipts stay scoped. */
export function publishDatabaseEvent(
  client: QueryClient,
  primary: SessionEntities,
  input: DatabaseMutationEventV2,
) {
  const event = databaseMutationEventV2Schema.parse(input);
  const cache = sharedClient(client);
  return cache.publication.batch(() => {
    let primaryResult: "published" | "authorized-read-required" = "authorized-read-required";
    for (const owner of [
      primary,
      ...cache
        .all()
        .filter(
          (owner) =>
            owner !== primary &&
            owner.session.scope.workspaceId === primary.session.scope.workspaceId &&
            owner.databases.hasHostInterest(event.databaseId),
        ),
    ]) {
      try {
        const result = owner.session.batch(() => {
          const admitted = owner.databases.ingestEvent(event);
          if (admitted === "published")
            reconcileBootstrapReferences(client, event, owner.session.id);
          return admitted;
        });
        if (owner === primary) primaryResult = result;
        else if (result === "authorized-read-required")
          void client
            .invalidateQueries({
              predicate: (query) => referencesScope(query.state.data, owner.session.id),
            })
            .catch(() => undefined);
      } catch (error) {
        if (owner === primary) throw error;
        // A narrower scope cannot borrow the primary scope's authorization.
        void client
          .invalidateQueries({
            predicate: (query) => referencesScope(query.state.data, owner.session.id),
          })
          .catch(() => undefined);
      }
    }
    return primaryResult;
  });
}
function referencesScope(input: unknown, cacheId: string): boolean {
  if (!input || typeof input !== "object") return false;
  if (Array.isArray(input)) return input.some((value) => referencesScope(value, cacheId));
  if ("cacheId" in input && input.cacheId === cacheId) return true;
  return Object.entries(input).some(
    ([key, value]) => key !== "content" && key !== "context" && referencesScope(value, cacheId),
  );
}
