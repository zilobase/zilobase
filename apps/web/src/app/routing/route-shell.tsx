import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useRef, useEffect } from "react";
import { editionWebModule } from "@zilobase/edition-web";
import { Button } from "@/components/ui/button";
import { recordDesktopDiagnostic } from "@/platform/diagnostics/desktop-diagnostics";
import { Spinner } from "@/components/ui/spinner";
const DocumentFavicon = lazy(() =>
  import("@/app/shell/components/document-favicon").then((module) => ({
    default: module.DocumentFavicon,
  })),
);

const AppShell = lazy(() =>
  import("@/app/shell/app-shell").then((module) => ({
    default: module.AppShell,
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
          <AppShell>
            <Outlet />
          </AppShell>
        </Suspense>
      ) : (
        <Outlet />
      )}
    </>
  );
}

export function PendingPage() {
  useEffect(() => {
    recordDesktopDiagnostic("router.pending", { status: "started" });
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <p className="text-sm text-content-secondary">Connecting to Zilobase...</p>
      </div>
    </main>
  );
}

export function AuthenticatedRouteError({ resource }: { resource: "database" | "page" }) {
  return (
    <main className="flex min-h-[calc(100svh-3rem)] flex-1 items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-sm text-content-secondary">This {resource} could not be opened.</p>
        <Button onClick={() => window.location.reload()} type="button" variant="outline">
          Try again
        </Button>
      </div>
    </main>
  );
}

export function EditionRouteHost() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const route = editionWebModule.routes.find(
    (candidate) =>
      `${editionWebModule.routePrefix}/${candidate.path.replace(/^\/+/, "")}` === pathname,
  );

  if (!route) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="text-sm text-content-secondary">Edition page not found.</p>
      </main>
    );
  }

  const EditionComponent = route.component;
  return <EditionComponent />;
}
