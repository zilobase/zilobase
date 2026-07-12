import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";

import { usePageEditorRegistry } from "@/contexts/page-editor-registry";
import { useNotelabFeatures } from "@notelab/features";
import {
  databaseQueryKey,
  databaseQueryOptions,
  type DatabasePayload,
} from "@notelab/features/databases";
import {
  ensurePageDetail,
  getPrimaryPageParentId,
  getPageFromDetail,
  pageQueryKey,
  pagesQueryKey,
  type Page,
  type PageDetail,
  type PageNavigationPayload,
  type PageItemPlacement,
} from "@notelab/features/pages";
import {
  buildContextMarkdown,
  collectRequiredLinkedDatabaseIds,
  extractDatabaseIds,
  logPageContext,
  stripDatabasePayload,
  warnPageContextTrimmed,
  type ContextAttachment,
  type ContextSection,
  type ContextSourceRef,
  type DatabaseContextPayload,
  type PageDatabaseContext,
} from "@notelab/page-context";

type UsePageAiContextOptions = {
  attachments?: ContextAttachment[];
  enabled?: boolean;
  workspaceId?: string | null;
  primarySource?: ContextSourceRef | null;
};

function buildPagePath(
  pagesById: Map<string, Page>,
  pageId: string,
  placements: PageItemPlacement[],
) {
  const parts: string[] = [];
  const visited = new Set<string>();
  let current = pagesById.get(pageId);

  while (current) {
    if (visited.has(current.id)) {
      break;
    }

    visited.add(current.id);
    parts.unshift(current.name.trim() || "Untitled");

    const parentItemId = getPrimaryPageParentId(placements, current.id);

    if (!parentItemId) {
      break;
    }

    current = pagesById.get(parentItemId);
  }

  return parts.join(" / ");
}

async function resolvePageForContext(
  pageId: string,
  queryClient: QueryClient,
  apiFetch: ReturnType<typeof useNotelabFeatures>["apiFetch"],
  getEditorContent: (pageId: string) => unknown | null,
) {
  const cached = getPageFromDetail(
    queryClient.getQueryData<PageDetail | null>(pageQueryKey(pageId)),
  );

  if (cached || getEditorContent(pageId) != null) {
    return cached;
  }

  return getPageFromDetail(
    await ensurePageDetail(queryClient, apiFetch, pageId),
  );
}

async function resolveDatabaseContext(
  databaseId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  apiFetch: ReturnType<typeof useNotelabFeatures>["apiFetch"],
  contextCache: Map<string, DatabaseContextPayload>,
): Promise<DatabaseContextPayload | null> {
  if (contextCache.has(databaseId)) {
    return contextCache.get(databaseId) ?? null;
  }

  const fullCached = queryClient.getQueryData<DatabasePayload | null>(
    databaseQueryKey(databaseId),
  );

  if (
    fullCached &&
    Array.isArray(fullCached.rows) &&
    Array.isArray(fullCached.values)
  ) {
    const contextPayload = stripDatabasePayload(fullCached);
    contextCache.set(databaseId, contextPayload);
    return contextPayload;
  }

  try {
    const payload = await queryClient.fetchQuery(
      databaseQueryOptions(apiFetch, databaseId),
    );

    if (!payload) {
      return null;
    }

    const contextPayload = stripDatabasePayload(payload);
    contextCache.set(databaseId, contextPayload);
    return contextPayload;
  } catch {
    return null;
  }
}

async function resolveLinkedSchemas(
  schema: DatabaseContextPayload,
  queryClient: ReturnType<typeof useQueryClient>,
  apiFetch: ReturnType<typeof useNotelabFeatures>["apiFetch"],
  contextCache: Map<string, DatabaseContextPayload>,
) {
  const linkedSourceSchemas: Record<string, DatabaseContextPayload> = {};
  const requiredIds = collectRequiredLinkedDatabaseIds([schema]);

  await Promise.all(
    requiredIds.map(async (databaseId) => {
      const linkedSchema = await resolveDatabaseContext(
        databaseId,
        queryClient,
        apiFetch,
        contextCache,
      );

      if (linkedSchema) {
        linkedSourceSchemas[databaseId] = linkedSchema;
      }
    }),
  );

  return linkedSourceSchemas;
}

async function resolvePageDatabases(
  content: unknown,
  queryClient: ReturnType<typeof useQueryClient>,
  apiFetch: ReturnType<typeof useNotelabFeatures>["apiFetch"],
  contextCache: Map<string, DatabaseContextPayload>,
) {
  const databaseIds = extractDatabaseIds(content);
  const databases: PageDatabaseContext[] = [];

  for (const databaseId of databaseIds) {
    const schema = await resolveDatabaseContext(
      databaseId,
      queryClient,
      apiFetch,
      contextCache,
    );

    if (!schema) {
      continue;
    }

    databases.push({
      schema,
      linkedSourceSchemas: await resolveLinkedSchemas(
        schema,
        queryClient,
        apiFetch,
        contextCache,
      ),
    });
  }

  return databases;
}

export function usePageAiContext({
  attachments = [],
  enabled = true,
  workspaceId,
  primarySource = null,
}: UsePageAiContextOptions) {
  const { apiFetch } = useNotelabFeatures();
  const queryClient = useQueryClient();
  const { getEditorHandle } = usePageEditorRegistry();
  const getEditorContent = useCallback(
    (pageId: string) => getEditorHandle(pageId)?.getContentJson() ?? null,
    [getEditorHandle],
  );
  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buildIdRef = useRef(0);

  const attachmentKey = useMemo(
    () => attachments.map((item) => `${item.type}:${item.id}`).join("|"),
    [attachments],
  );

  const trackedDatabaseIds = useMemo(() => {
    const ids = new Set<string>();

    if (primarySource?.type === "database") {
      ids.add(primarySource.id);
    }

    if (primarySource?.type === "page") {
      const page = getPageFromDetail(
        queryClient.getQueryData<PageDetail | null>(
          pageQueryKey(primarySource.id),
        ),
      );
      const content =
        getEditorContent(primarySource.id) ?? page?.content ?? null;

      for (const databaseId of extractDatabaseIds(content)) {
        ids.add(databaseId);
      }
    }

    for (const attachment of attachments) {
      if (attachment.type === "database") {
        ids.add(attachment.id);
      }
    }

    return [...ids];
  }, [attachments, getEditorContent, primarySource, queryClient]);

  const buildContext = useCallback(async () => {
    if (!enabled || !workspaceId) {
      setMarkdown("");
      setError(null);
      setIsLoading(false);
      return;
    }

    const buildId = buildIdRef.current + 1;
    buildIdRef.current = buildId;
    setIsLoading(true);
    setError(null);

    const startedAt = performance.now();

    try {
      const navigation = queryClient.getQueryData<PageNavigationPayload>(
        pagesQueryKey(workspaceId),
      );
      const pages = navigation?.pages ?? [];
      const pagesById = new Map(pages.map((page) => [page.id, page]));
      const contextCache = new Map<string, DatabaseContextPayload>();
      const sections: ContextSection[] = [];

      if (primarySource?.type === "page") {
        const page = await resolvePageForContext(
          primarySource.id,
          queryClient,
          apiFetch,
          getEditorContent,
        );

        const content =
          getEditorContent(primarySource.id) ?? page?.content ?? null;

        sections.push({
          kind: "page",
          role: "primary",
          id: primarySource.id,
          title: page?.name?.trim() || "Untitled",
          path: buildPagePath(
            pagesById,
            primarySource.id,
            navigation?.placements ?? [],
          ),
          content,
          databases: await resolvePageDatabases(
            content,
            queryClient,
            apiFetch,
            contextCache,
          ),
        });
      } else if (primarySource?.type === "database") {
        const schema = await resolveDatabaseContext(
          primarySource.id,
          queryClient,
          apiFetch,
          contextCache,
        );

        if (schema) {
          sections.push({
            kind: "database",
            role: "primary",
            schema,
            linkedSourceSchemas: await resolveLinkedSchemas(
              schema,
              queryClient,
              apiFetch,
              contextCache,
            ),
          });
        }
      }

      for (const attachment of attachments) {
        if (
          primarySource &&
          primarySource.type === attachment.type &&
          primarySource.id === attachment.id
        ) {
          continue;
        }

        if (attachment.type === "page") {
          const page = await resolvePageForContext(
            attachment.id,
            queryClient,
            apiFetch,
            getEditorContent,
          );

          sections.push({
            kind: "page",
            role: "attached",
            id: attachment.id,
            title: attachment.title,
            path: attachment.path,
            content: page?.content ?? null,
            databases: await resolvePageDatabases(
              page?.content ?? null,
              queryClient,
              apiFetch,
              contextCache,
            ),
          });
          continue;
        }

        const schema = await resolveDatabaseContext(
          attachment.id,
          queryClient,
          apiFetch,
          contextCache,
        );

        if (!schema) {
          continue;
        }

        sections.push({
          kind: "database",
          role: "attached",
          schema,
          linkedSourceSchemas: await resolveLinkedSchemas(
            schema,
            queryClient,
            apiFetch,
            contextCache,
          ),
        });
      }

      if (buildId !== buildIdRef.current) {
        return;
      }

      const result = buildContextMarkdown({ sections });

      if (result.trimmedAttachmentIds.length > 0) {
        warnPageContextTrimmed(result.trimmedAttachmentIds);
      }

      setMarkdown(result.markdown);
      logPageContext(result.markdown, {
        primaryId: primarySource?.id ?? null,
        attachmentIds: attachments.map((item) => item.id),
        charCount: result.charCount,
        buildMs: Math.round(performance.now() - startedAt),
        trimmedAttachmentIds: result.trimmedAttachmentIds,
      });
    } catch (buildError) {
      if (buildId !== buildIdRef.current) {
        return;
      }

      setError(
        buildError instanceof Error
          ? buildError.message
          : "Failed to build page context",
      );
      setMarkdown("");
    } finally {
      if (buildId === buildIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    apiFetch,
    attachmentKey,
    attachments,
    enabled,
    getEditorContent,
    workspaceId,
    primarySource,
    queryClient,
  ]);

  useEffect(() => {
    void buildContext();
  }, [buildContext]);

  useEffect(() => {
    if (!enabled || trackedDatabaseIds.length === 0) {
      return;
    }

    const trackedIdSet = new Set(trackedDatabaseIds);

    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") {
        return;
      }

      const queryKey = event.query.queryKey;

      if (queryKey[0] !== "database" || typeof queryKey[1] !== "string") {
        return;
      }

      if (!trackedIdSet.has(queryKey[1])) {
        return;
      }

      void buildContext();
    });
  }, [buildContext, enabled, trackedDatabaseIds]);

  return {
    error,
    isLoading,
    markdown,
    rebuild: buildContext,
  };
}
