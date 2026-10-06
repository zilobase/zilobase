import {
  resolveNavigationDatabase,
  resolvePlacement,
  pagePreferenceSchema,
} from "./navigation-references";
import { pageCacheEntitySchema } from "./cache-entities";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient, type SharedClient } from "../data/client";
import type { Page, PageDetail, PageNavigationPayload } from "./contracts";

export type PageReference = {
  id: string;
  cacheId: string;
  context: Pick<
    Page,
    | "content"
    | "createdBy"
    | "deletedBy"
    | "publishedOwnerPreferences"
    | "isFavorite"
    | "isShared"
    | "lastVisitedAt"
    | "parentPageId"
  >;
};
export type PageDetailReference = Omit<PageDetail, "page"> & { page: PageReference };
export type PageNavigationReference = {
  pages: PageReference[];
  databases: import("./navigation-references").NavigationDatabaseReference[];
  placements: import("./navigation-references").PlacementReference[];
};

export function prepareAuthorizedPages(
  queryClient: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  workspaceId: string,
  pages: Page[],
  capability?: { kind: "guest" | "public"; id: string },
) {
  const entities = sharedClient(queryClient).resolve(read, workspaceId, capability);
  const references = pages.map((page) => {
    if (page.workspaceId !== workspaceId) throw new Error("Page workspace identity mismatch");
    const {
      content,
      createdBy,
      deletedBy,
      publishedOwnerPreferences,
      isFavorite,
      isShared,
      lastVisitedAt,
      parentPageId,
      ...metadata
    } = page;
    return {
      metadata: pageCacheEntitySchema.parse(metadata),
      preferences: {
        id: page.id,
        readSequence: read.sequence,
        publishedOwnerPreferences,
        isFavorite,
        isShared,
        lastVisitedAt,
        parentPageId,
      },
      reference: {
        id: page.id,
        cacheId: entities.session.id,
        context: Object.fromEntries(
          Object.entries({
            content,
            createdBy,
            deletedBy,
          }).filter(([, value]) => value !== undefined),
        ),
      } satisfies PageReference,
    };
  });
  return {
    entities,
    inputs: [
      entities.pages.stage(references.map(({ metadata }) => metadata)),
      entities.navigation.pagePreferences.stage(references.map(({ preferences }) => preferences)),
    ],
    references: references.map(({ reference }) => reference),
    metadata: references.map(({ metadata }) => metadata),
  };
}

export function stageAuthorizedPages(...args: Parameters<typeof prepareAuthorizedPages>) {
  const prepared = prepareAuthorizedPages(...args);
  sharedClient(args[0]).publication.batch(() => {
    prepared.entities.session.ingest(prepared.inputs);
    for (const other of sharedClient(args[0]).all()) {
      if (other === prepared.entities || other.session.scope.workspaceId !== args[2]) continue;
      const known = prepared.metadata.filter((page) => other.pages.collection.base.has(page.id));
      if (known.length) other.session.ingest([other.pages.stage(known)]);
    }
  });
  return prepared.references;
}

export function resolvePageReference(
  queryClient: QueryClient,
  reference: PageReference,
): Page | null {
  const owner = sharedClient(queryClient).get(reference.cacheId);
  const page = owner?.pages.get(reference.id);
  const preference = owner?.navigation.pagePreferences.get(reference.id);
  const {
    id: _id,
    readSequence: _sequence,
    ...preferences
  } = preference ? pagePreferenceSchema.strip().parse(preference) : {};
  if (!page) return null;
  return {
    ...reference.context,
    ...preferences,
    ...pageCacheEntitySchema.strip().parse(page),
    createdAt: page.createdAt ?? page.updatedAt,
    type: page.type ?? "pageblock",
    url: page.url ?? "#",
  };
}
export function resolveNavigationReference(
  queryClient: QueryClient,
  reference: PageNavigationReference,
): PageNavigationPayload {
  return {
    pages: reference.pages.flatMap((page) => resolvePageReference(queryClient, page) ?? []),
    databases: reference.databases.flatMap(
      (database) => resolveNavigationDatabase(queryClient, database) ?? [],
    ),
    placements: reference.placements.flatMap(
      (placement) => resolvePlacement(queryClient, placement) ?? [],
    ),
  };
}

export { createPageCollection } from "./cache-registration";

export function resolvePageDetailReference(
  queryClient: QueryClient,
  detail: PageDetailReference | null | undefined,
): PageDetail | null {
  if (!detail) return null;
  const page = resolvePageReference(queryClient, detail.page);
  return page ? { ...detail, page } : null;
}

export function cachePageDetail(
  queryClient: QueryClient,
  detail: PageDetail,
  read = sharedClient(queryClient).capture(),
) {
  const reference = stageAuthorizedPages(
    queryClient,
    read,
    detail.page.workspaceId,
    [detail.page],
    detail.viewerType === "guest" || detail.viewerType === "public"
      ? { kind: detail.viewerType, id: detail.page.id }
      : undefined,
  )[0]!;
  queryClient.setQueryData<PageDetailReference | null>(["page", detail.page.id], (current) => ({
    ...detail,
    page: { ...reference, context: { ...current?.page.context, ...reference.context } },
  }));
}

export function readCachedPage(queryClient: QueryClient, id: string) {
  const detail = queryClient.getQueryData<PageDetailReference | null>(["page", id]);
  if (detail) return resolvePageReference(queryClient, detail.page);
  for (const [, navigation] of queryClient.getQueriesData<PageNavigationReference>({
    queryKey: ["pages"],
  })) {
    const reference = navigation?.pages?.find((page) => page.id === id);
    if (reference) return resolvePageReference(queryClient, reference);
  }
  const owners = sharedClient(queryClient)
    .all()
    .filter((owner) => owner.pages.get(id));
  if (owners.length === 1)
    return resolvePageReference(queryClient, { id, cacheId: owners[0]!.session.id, context: {} });
  return null;
}

export function updatePageContexts(
  queryClient: QueryClient,
  id: string,
  patch: PageReference["context"],
  read = sharedClient(queryClient).capture(),
) {
  if (!sharedClient(queryClient).isCurrent(read))
    throw new Error("Expired page preference confirmation");
  const detail = queryClient.getQueryData<PageDetailReference>(["page", id]);
  const scopeId = read.scopeId ?? detail?.page.cacheId;
  const owners = scopeId
    ? [sharedClient(queryClient).get(scopeId)].filter((owner) => !!owner)
    : sharedClient(queryClient)
        .all()
        .filter((owner) => owner.session.scope.viewer.kind === "account");
  for (const owner of owners) {
    if (!owner.pages.collection.base.has(id)) continue;
    const { isFavorite, isShared, lastVisitedAt, parentPageId, publishedOwnerPreferences } = patch;
    owner.session.ingest([
      owner.navigation.pagePreferences.stage([
        {
          id,
          readSequence: read.sequence,
          isFavorite,
          isShared,
          lastVisitedAt,
          parentPageId,
          publishedOwnerPreferences,
        },
      ]),
    ]);
  }
  const { content, createdBy, deletedBy } = patch;
  const context = Object.fromEntries(
    Object.entries({ content, createdBy, deletedBy }).filter(([, value]) => value !== undefined),
  );
  queryClient.setQueryData<PageDetailReference | null>(["page", id], (current) =>
    current
      ? { ...current, page: { ...current.page, context: { ...current.page.context, ...context } } }
      : current,
  );
  queryClient.setQueriesData<PageNavigationReference>({ queryKey: ["pages"] }, (current) =>
    current?.pages
      ? {
          ...current,
          pages: current.pages.map((page) =>
            page.id === id ? { ...page, context: { ...page.context, ...context } } : page,
          ),
        }
      : current,
  );
}
