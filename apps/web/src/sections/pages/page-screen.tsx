import { PageWorkspaceGate } from "@/sections/workspaces/access/components/page-workspace-gate";
import { PageSidePaneLayout } from "@/sections/pages/presentation/components/page-side-pane";
import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { usePage } from "@zilobase/features/pages/react";
import { useOpenEmbeddedPage } from "./navigation/hooks/page-navigation";
import { PageContent } from "./editor/page-content";

import { useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { AuthenticatedRouteError } from "@/app/routing/route-shell";
import { FallbackErrorBoundary } from "@/app/routing/components/fallback-error-boundary";
import { PublicPage, GuestPage } from "./access/public-and-guest-page-screen";
import { PageLayout } from "./layout/components/page-layout";

export default function PageScreen() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { publishedShare } = useRouteContext({ from: "/p/$pageId" });

  if (publishedShare === "public") {
    return <PublicPage />;
  }

  if (publishedShare === "guest") {
    return <GuestPage />;
  }

  return (
    <FallbackErrorBoundary
      fallback={<AuthenticatedRouteError resource="page" />}
      key={pageId}
      name="page.authenticated"
    >
      <AuthenticatedPage />
    </FallbackErrorBoundary>
  );
}

function AuthenticatedPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { meeting: focusMeetingId, block: focusBlockId } = useSearch({ from: "/p/$pageId" });
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const {
    closeSidePane,
    openSidePaneAsFullPage,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: pageId,
    page,
  });

  return (
    <PageSidePaneLayout
      mainOwnsLayout
      main={
        <PageLayout pageId={pageId} placement="main">
          <PageWorkspaceGate pageId={pageId}>
            <PageContent
              focusMeetingId={focusMeetingId}
              focusBlockId={focusBlockId}
              key={pageId}
              onOpenPage={openPage}
              pageId={pageId}
              showConnectionIndicator
            />
          </PageWorkspaceGate>
        </PageLayout>
      }
      sidePane={
        sidePaneContentReady && renderedSidePanePageId ? (
          <PageLayout
            pageId={renderedSidePanePageId}
            placement="pane"
            rowNavigationDatabaseId={sidePaneDatabaseId}
            onClose={closeSidePane}
            onOpenFullPage={openSidePaneAsFullPage}
          >
            <PageWorkspaceGate pageId={renderedSidePanePageId}>
              <PageContent
                databaseId={sidePaneDatabaseId}
                layoutPanelMode="overlay"
                key={renderedSidePanePageId}
                onOpenPage={openPage}
                pageId={renderedSidePanePageId}
              />
            </PageWorkspaceGate>
          </PageLayout>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={renderedSidePanePageId !== null}
    />
  );
}
