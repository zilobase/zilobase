import { Outlet, useRouterState } from "@tanstack/react-router";
import { useRef } from "react";

import { AppLayout } from "@/app/shell/content/app-layout";
import { DocumentFavicon } from "@/app/shell/document-favicon";

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
      <DocumentFavicon />
      {showAppShell ? (
        <AppLayout>
          <Outlet />
        </AppLayout>
      ) : (
        <Outlet />
      )}
    </>
  );
}
