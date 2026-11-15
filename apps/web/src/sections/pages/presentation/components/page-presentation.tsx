import { usePageEditorRegistry } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Effect } from "effect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isMobileViewport, useIsMobile } from "@/hooks/use-mobile";
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages";

export type OpenPageSidePaneOptions = {
  databaseId?: string | null;
  /** A block to reveal, from an AI citation. */
  blockId?: string | null;
  focusTitle?: boolean;
};

export type PageSidePaneContextValue = {
  closeEmbeddedPageDialog: () => void;
  closeSidePane: () => void;
  dialogDatabaseId: string | null;
  dialogPageId: string | null;
  dialogFocusTitle: boolean;
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  mainHeader?: ReactNode;
  openEmbeddedPageDialog: (pageId: string, options?: OpenPageSidePaneOptions) => void;
  openDatabaseSidePane: (databaseId: string) => void;
  openDatabaseInMainPane: (databaseId: string) => void;
  openPageInMainPane: (pageId: string, options?: OpenPageSidePaneOptions) => void;
  openSidePaneAsFullPage: () => void;
  openSidePane: (pageId: string, options?: OpenPageSidePaneOptions) => void;
  renderedSidePaneDatabaseId: string | null;
  renderedSidePanePageId: string | null;
  sidePaneAnimatedOpen: boolean;
  sidePaneContentReady: boolean;
  sidePaneDatabaseId: string | null;
  sidePaneBlockId: string | null;
  sidePanePageId: string | null;
};

export const PageSidePaneContext = createContext<PageSidePaneContextValue | null>(null);

export const WORKSPACE_SIDE_PANE_TRANSITION_MS = 200;

export const SIDE_PANE_DEFAULT_MIN_WIDTH_REM = 22;
export const SIDE_PANE_DEFAULT_MAX_WIDTH_REM = 48;
export const SIDE_PANE_DEFAULT_WIDTH = `clamp(${SIDE_PANE_DEFAULT_MIN_WIDTH_REM}rem, 50%, ${SIDE_PANE_DEFAULT_MAX_WIDTH_REM}rem)`;
export const SIDE_PANE_MIN_WIDTH = 320;
export const SIDE_PANE_MAX_WIDTH_RATIO = 2 / 3;
export const SIDE_PANE_READABLE_MIN_WIDTH = 352;
export const SIDE_PANE_KEYBOARD_RESIZE_STEP = 24;

const SIDE_PANE_PAGE_PARAM = "p";
const SIDE_PANE_DATABASE_PARAM = "d";
const SIDE_PANE_BLOCK_PARAM = "b";

export const getFullPagePath = (pageId: string) => `/p/${encodeURIComponent(pageId)}`;

export const getFullDatabasePath = (databaseId: string) => `/d/${encodeURIComponent(databaseId)}`;

export function usePageSidePaneState(
  _resetKey?: string | null,
  embeddedItemsOpenAs: EmbeddedItemsOpenAs = "sidepanel",
): PageSidePaneContextValue {
  const router = useRouter();
  const isMobile = useIsMobile();
  const location = useLocation({
    select: ({ hash, pathname, searchStr }) => ({
      hash,
      pathname,
      searchStr,
    }),
  });
  const sidePanePageId = getSearchParam(location.searchStr, SIDE_PANE_PAGE_PARAM);
  const sidePaneDatabaseId = getSearchParam(location.searchStr, SIDE_PANE_DATABASE_PARAM);
  const sidePaneBlockId = getSearchParam(location.searchStr, SIDE_PANE_BLOCK_PARAM);
  const { getEditorHandle } = usePageEditorRegistry();
  const [dialogPageId, setDialogPageId] = useState<string | null>(null);
  const [dialogDatabaseId, setDialogDatabaseId] = useState<string | null>(null);
  const [dialogFocusTitle, setDialogFocusTitle] = useState(false);
  const [renderedSidePanePageId, setRenderedSidePanePageId] = useState<string | null>(null);
  const [renderedSidePaneDatabaseId, setRenderedSidePaneDatabaseId] = useState<string | null>(null);
  const [sidePaneAnimatedOpen, setSidePaneAnimatedOpen] = useState(false);
  const [sidePaneContentReady, setSidePaneContentReady] = useState(false);
  const sidePaneWasOpenRef = useRef(false);
  const writeSidePaneParams = useCallback(
    (
      pageId: string | null,
      databaseId?: string | null,
      replace = false,
      blockId?: string | null,
    ) => {
      const params = new URLSearchParams(location.searchStr);
      const databaseParam = getSidePaneDatabaseParam(location.pathname, databaseId);

      if (pageId) {
        params.set(SIDE_PANE_PAGE_PARAM, pageId);
      } else {
        params.delete(SIDE_PANE_PAGE_PARAM);
      }

      if (databaseParam) {
        params.set(SIDE_PANE_DATABASE_PARAM, databaseParam);
      } else {
        params.delete(SIDE_PANE_DATABASE_PARAM);
      }

      if (pageId && blockId) params.set(SIDE_PANE_BLOCK_PARAM, blockId);
      else params.delete(SIDE_PANE_BLOCK_PARAM);

      const search = params.toString();
      const hash = location.hash ? `#${location.hash}` : "";
      const path = `${location.pathname}${search ? `?${search}` : ""}${hash}`;

      if (path === `${location.pathname}${location.searchStr}${hash}`) {
        return;
      }

      if (replace) {
        router.history.replace(path);
        return;
      }

      router.history.push(path);
    },
    [location.hash, location.pathname, location.searchStr, router.history],
  );
  const closeSidePane = useCallback(() => {
    writeSidePaneParams(null, null, true);
  }, [writeSidePaneParams]);
  const closeEmbeddedPageDialog = useCallback(() => {
    setDialogPageId(null);
    setDialogDatabaseId(null);
    setDialogFocusTitle(false);
  }, []);
  const openSidePane = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      Effect.runSync(
        Effect.sync(() => {
          if (isMobile || isMobileViewport()) {
            closeEmbeddedPageDialog();
            if (location.pathname !== getFullPagePath(nextPageId))
              router.history.push(getFullPagePath(nextPageId));
            return;
          }
          const existing = getEditorHandle(nextPageId);
          if (existing?.focus && sidePanePageId !== nextPageId && dialogPageId !== nextPageId) {
            existing.focus();
            return;
          }
          closeEmbeddedPageDialog();

          writeSidePaneParams(nextPageId, options?.databaseId, false, options?.blockId);
        }),
      );
    },
    [
      getEditorHandle,
      sidePanePageId,
      dialogPageId,
      closeEmbeddedPageDialog,
      isMobile,
      location.pathname,
      router.history,
      writeSidePaneParams,
    ],
  );
  const openDatabaseSidePane = useCallback(
    (databaseId: string) => {
      Effect.runSync(
        Effect.sync(() => {
          closeEmbeddedPageDialog();

          if (isMobile || isMobileViewport()) {
            router.history.push(getFullDatabasePath(databaseId));
            return;
          }

          writeSidePaneParams(null, databaseId);
        }),
      );
    },
    [getEditorHandle, closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  );
  const openPageInMainPane = useCallback(
    (nextPageId: string, _options?: OpenPageSidePaneOptions) => {
      Effect.runSync(
        Effect.gen(function* () {
          yield* Effect.sync(closeEmbeddedPageDialog);
          yield* Effect.sync(() => router.history.push(getFullPagePath(nextPageId)));
        }),
      );
    },
    [closeEmbeddedPageDialog, router.history],
  );
  const openDatabaseInMainPane = useCallback(
    (databaseId: string) => {
      Effect.runSync(
        Effect.gen(function* () {
          yield* Effect.sync(closeEmbeddedPageDialog);
          yield* Effect.sync(() => router.history.push(getFullDatabasePath(databaseId)));
        }),
      );
    },
    [closeEmbeddedPageDialog, router.history],
  );
  const openSidePaneAsFullPage = useCallback(() => {
    if (sidePanePageId) {
      openPageInMainPane(sidePanePageId);
    } else if (sidePaneDatabaseId) {
      openDatabaseInMainPane(sidePaneDatabaseId);
    }
  }, [openDatabaseInMainPane, openPageInMainPane, sidePaneDatabaseId, sidePanePageId]);
  const openEmbeddedPageDialog = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      Effect.runSync(
        Effect.sync(() => {
          if (isMobile || isMobileViewport()) {
            closeEmbeddedPageDialog();
            if (location.pathname !== getFullPagePath(nextPageId))
              router.history.push(getFullPagePath(nextPageId));
            return;
          }
          const existing = getEditorHandle(nextPageId);
          if (existing?.focus && sidePanePageId !== nextPageId && dialogPageId !== nextPageId) {
            existing.focus();
            return;
          }

          closeSidePane();
          setDialogPageId(nextPageId);
          setDialogDatabaseId(options?.databaseId ?? null);
          setDialogFocusTitle(options?.focusTitle ?? false);
        }),
      );
    },
    [
      closeSidePane,
      closeEmbeddedPageDialog,
      getEditorHandle,
      sidePanePageId,
      dialogPageId,
      isMobile,
      location.pathname,
      router.history,
    ],
  );

  useEffect(() => {
    if (!isMobile && !isMobileViewport()) return;
    const target = dialogPageId ?? sidePanePageId;
    const targetPath = target
      ? getFullPagePath(target)
      : sidePaneDatabaseId
        ? getFullDatabasePath(sidePaneDatabaseId)
        : null;
    if (!targetPath) return;
    Effect.runSync(
      Effect.gen(function* () {
        yield* Effect.sync(closeEmbeddedPageDialog);
        yield* Effect.sync(() => router.history.replace(targetPath));
      }),
    );
  }, [
    closeEmbeddedPageDialog,
    dialogPageId,
    isMobile,
    router.history,
    sidePaneDatabaseId,
    sidePanePageId,
  ]);

  useEffect(() => {
    const sidePaneTargetKey = sidePanePageId
      ? `page:${sidePanePageId}`
      : sidePaneDatabaseId
        ? `database:${sidePaneDatabaseId}`
        : null;

    if (!sidePaneTargetKey) {
      sidePaneWasOpenRef.current = false;
      setSidePaneContentReady(false);
      setSidePaneAnimatedOpen(false);

      const timer = window.setTimeout(() => {
        setRenderedSidePanePageId(null);
        setRenderedSidePaneDatabaseId(null);
      }, WORKSPACE_SIDE_PANE_TRANSITION_MS);

      return () => {
        window.clearTimeout(timer);
      };
    }

    const isAlreadyOpen = sidePaneWasOpenRef.current;

    setRenderedSidePanePageId(sidePanePageId);
    setRenderedSidePaneDatabaseId(sidePanePageId ? null : sidePaneDatabaseId);
    sidePaneWasOpenRef.current = true;

    if (isAlreadyOpen) {
      setSidePaneAnimatedOpen(true);
      setSidePaneContentReady(true);
      return;
    }

    setSidePaneContentReady(false);
    setSidePaneAnimatedOpen(false);

    let cancelled = false;
    let openFrame = 0;
    let settleFrame = 0;

    openFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          setSidePaneAnimatedOpen(true);
          setSidePaneContentReady(true);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(openFrame);
      cancelAnimationFrame(settleFrame);
    };
  }, [sidePaneDatabaseId, sidePanePageId]);

  return useMemo<PageSidePaneContextValue>(
    () => ({
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogFocusTitle,
      dialogPageId,
      embeddedItemsOpenAs,
      openEmbeddedPageDialog,
      openDatabaseInMainPane,
      openDatabaseSidePane,
      openPageInMainPane,
      openSidePaneAsFullPage,
      openSidePane,
      renderedSidePaneDatabaseId,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePaneBlockId,
      sidePanePageId,
    }),
    [
      sidePaneBlockId,
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      dialogFocusTitle,
      embeddedItemsOpenAs,
      openEmbeddedPageDialog,
      openDatabaseInMainPane,
      openDatabaseSidePane,
      openPageInMainPane,
      openSidePaneAsFullPage,
      openSidePane,
      renderedSidePaneDatabaseId,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePanePageId,
    ],
  );
}

function getSearchParam(search: string, key: string) {
  return new URLSearchParams(search).get(key)?.trim() || null;
}

export function getSidePaneDatabaseParam(pathname: string, databaseId?: string | null) {
  if (!databaseId) {
    return null;
  }

  const routeDatabaseId = pathname.match(/^\/d\/([^/]+)/)?.[1];
  if (!routeDatabaseId) {
    return databaseId;
  }

  return decodeURIComponent(routeDatabaseId) === databaseId ? null : databaseId;
}

export function PageSidePaneProvider({
  children,
  embeddedItemsOpenAs = "sidepanel",
  resetKey,
}: {
  children: ReactNode;
  embeddedItemsOpenAs?: EmbeddedItemsOpenAs;
  resetKey?: string | null;
}) {
  const sidePaneContext = usePageSidePaneState(resetKey, embeddedItemsOpenAs);

  return (
    <PageSidePaneContext.Provider value={sidePaneContext}>{children}</PageSidePaneContext.Provider>
  );
}

export function usePageSidePane() {
  const context = useContext(PageSidePaneContext);

  if (!context) {
    throw new Error("usePageSidePane must be used inside a side pane provider");
  }

  return context;
}

export function useOptionalPageSidePane() {
  return useContext(PageSidePaneContext);
}
