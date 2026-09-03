import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useRef } from "react";

import { PendingPage } from "./pending-page";

const DocumentFavicon = lazy(() =>
  import("@/app/shell/document-favicon").then((module) => ({
    default: module.DocumentFavicon,
  })),
);
const AppLayout = lazy(() =>
  import("@/app/shell/content/app-layout").then((module) => ({
    default: module.AppLayout,
  })),
);

export function RootRouteShell() {
  const matches = useRouterState({ select: (state) => state.matches });
  const shellVisibleForResolvedRoute = matches.some((match) => {
    if (match.routeId === "/app") return true;
    if (match.routeId === "/m/$meetingId") {
      const context = match.context as { authenticatedMeeting?: boolean };
      return context.authenticatedMeeting === true;
    }
    if (match.routeId !== "/p/$pageId" && match.routeId !== "/d/$databaseId") {
      return false;
    }

    const context = match.context as { publishedShare?: string };
    return context.publishedShare === "app";
  });
  const routePending = matches.some((match) => match.status === "pending");
  const resolvedShellVisibleRef = useRef(false);

  if (!routePending) {
    resolvedShellVisibleRef.current = shellVisibleForResolvedRoute;
  }

  const showAppShell = routePending
    ? resolvedShellVisibleRef.current
    : shellVisibleForResolvedRoute;

  return (
    <>
      <Suspense fallback={null}>
        <DocumentFavicon />
      </Suspense>
      {showAppShell ? (
        <Suspense fallback={<PendingPage />}>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </Suspense>
      ) : (
        <Outlet />
      )}
    </>
  );
}
