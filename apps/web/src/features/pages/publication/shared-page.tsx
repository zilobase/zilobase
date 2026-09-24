import { Link, useParams } from "@tanstack/react-router";
import { ArrowRight, Maximize2 } from "@/shared/components/icons";
import { PageSidePaneLayout, PageSidePaneProvider, usePageSidePane } from "../pane/page-side-pane";
import { Button } from "@/shared/ui/button";
import { usePage } from "@zilobase/features/pages/react";
import { EmbeddedPageDialog } from "../pane/embedded-page-dialog";
import { useOpenEmbeddedPage } from "../pane/use-open-embedded-page";
import { GuestPaneTopbar, PublicPaneTopbar } from "./shared-page-header";
import { PageEditorPane } from "../pane/page-editor-pane";

export function PublicPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <PublicPageContent pageId={pageId} />
    </PageSidePaneProvider>
  );
}

export function GuestPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });

  return (
    <PageSidePaneProvider resetKey={pageId}>
      <PublicPageContent guest pageId={pageId} />
    </PageSidePaneProvider>
  );
}

function PublicPageContent({ guest = false, pageId }: { guest?: boolean; pageId: string }) {
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const {
    closeSidePane,
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
    <>
      <PageSidePaneLayout
        className="bg-surface-canvas"
        standalone
        viewportHeightClass="h-svh"
        main={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {guest ? <GuestPaneTopbar pageId={pageId} /> : <PublicPaneTopbar pageId={pageId} />}
            <PageEditorPane
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              key={pageId}
              onOpenPage={openPage}
              readOnly={!guest}
              pageId={pageId}
            />
          </div>
        }
        sidePane={
          renderedSidePanePageId ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label="Close side pane"
                    onClick={closeSidePane}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowRight />
                  </Button>
                  <Button aria-label="Open as main page" asChild size="icon" variant="ghost">
                    <Link params={{ pageId: renderedSidePanePageId }} to="/p/$pageId">
                      <Maximize2 />
                    </Link>
                  </Button>
                </div>
              </div>
              {sidePaneContentReady ? (
                <PageEditorPane
                  className="min-h-0 flex-1"
                  databaseId={sidePaneDatabaseId}
                  enableComments={false}
                  key={renderedSidePanePageId}
                  onOpenPage={openPage}
                  readOnly={!guest}
                  pageId={renderedSidePanePageId}
                />
              ) : null}
            </div>
          ) : null
        }
        sidePaneOpen={sidePaneAnimatedOpen}
        sidePaneVisible={renderedSidePanePageId !== null}
      />
      <EmbeddedPageDialog onOpenPage={openPage} pageRenderer={PageEditorPane} />
    </>
  );
}
