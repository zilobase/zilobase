import { useParams, useSearch } from "@tanstack/react-router";
import { PageWorkspaceGate } from "@/features/workspaces";
import { PageSidePaneLayout, usePageSidePane } from "../pane/page-side-pane";
import { usePage } from "@zilobase/features/pages/react";
import { useOpenEmbeddedPage } from "../pane/use-open-embedded-page";
import { PageEditorPane } from "../pane/page-editor-pane";

export function AuthenticatedPage() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { meeting: focusMeetingId } = useSearch({ from: "/p/$pageId" });
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const { renderedSidePanePageId, sidePaneAnimatedOpen, sidePaneContentReady, sidePaneDatabaseId } =
    usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: pageId,
    page,
  });

  return (
    <PageSidePaneLayout
      main={
        <PageWorkspaceGate pageId={pageId}>
          <PageEditorPane
            focusMeetingId={focusMeetingId}
            key={pageId}
            onOpenPage={openPage}
            pageId={pageId}
          />
        </PageWorkspaceGate>
      }
      sidePane={
        sidePaneContentReady && renderedSidePanePageId ? (
          <PageWorkspaceGate pageId={renderedSidePanePageId}>
            <PageEditorPane
              databaseId={sidePaneDatabaseId}
              enableComments={false}
              layoutPanelMode="overlay"
              key={renderedSidePanePageId}
              onOpenPage={openPage}
              pageId={renderedSidePanePageId}
            />
          </PageWorkspaceGate>
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={renderedSidePanePageId !== null}
    />
  );
}
