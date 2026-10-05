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
export type PageNavigationReference = Omit<PageNavigationPayload, "pages"> & {
  pages: PageReference[];
};

export function stageAuthorizedPages(
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
      reference: {
        id: page.id,
        cacheId: entities.session.id,
        context: Object.fromEntries(
          Object.entries({
            content,
            createdBy,
            deletedBy,
            publishedOwnerPreferences,
            isFavorite,
            isShared,
            lastVisitedAt,
            parentPageId,
          }).filter(([, value]) => value !== undefined),
        ),
      } satisfies PageReference,
    };
  });
  entities.session.ingest([entities.pages.stage(references.map(({ metadata }) => metadata))]);
  return references.map(({ reference }) => reference);
}

export function resolvePageReference(
  queryClient: QueryClient,
  reference: PageReference,
): Page | null {
  const page = sharedClient(queryClient).get(reference.cacheId)?.pages.get(reference.id);
  if (!page) return null;
  return {
    ...reference.context,
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
    ...reference,
    pages: reference.pages.flatMap((page) => resolvePageReference(queryClient, page) ?? []),
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
  for (const entities of sharedClient(queryClient).all()) {
    const page = entities.pages.get(id);
    if (page)
      return resolvePageReference(queryClient, { id, cacheId: entities.session.id, context: {} });
  }
  return null;
}

export function updatePageContexts(
  queryClient: QueryClient,
  id: string,
  patch: PageReference["context"],
) {
  queryClient.setQueryData<PageDetailReference | null>(["page", id], (current) =>
    current
      ? { ...current, page: { ...current.page, context: { ...current.page.context, ...patch } } }
      : current,
  );
  queryClient.setQueriesData<PageNavigationReference>({ queryKey: ["pages"] }, (current) =>
    current?.pages
      ? {
          ...current,
          pages: current.pages.map((page) =>
            page.id === id ? { ...page, context: { ...page.context, ...patch } } : page,
          ),
        }
      : current,
  );
}
