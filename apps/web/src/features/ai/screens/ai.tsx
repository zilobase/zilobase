import { PageWorkspaceGate } from "@/features/workspaces";
import {
  usePageSidePane,
} from "@/features/pages/pane/page-side-pane";
import {
  useOpenEmbeddedPage,
} from "@/features/pages/pane/use-open-embedded-page";
import { DatabaseMainPane } from "@/features/databases/core/index";
import { PageEditorPane } from "@/features/pages/pane/page-editor-pane";
import { AgentChatWorkspace } from "../conversations/components/agent-chat-workspace";

export default function AiPage() {
  const {
    renderedSidePaneDatabaseId,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane();
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: null,
    databaseId: null,
    page: null,
  });
  const openSidePaneChildPage = (pageId: string) => {
    openPage(pageId, { databaseId: sidePaneDatabaseId });
  };

  const externalSidePane =
    sidePaneContentReady &&
    (renderedSidePanePageId || renderedSidePaneDatabaseId) ? (
          renderedSidePaneDatabaseId ? (
            <DatabaseMainPane
              className="min-h-0 flex-1 overflow-y-auto"
              databaseId={renderedSidePaneDatabaseId}
              embedded
              key={renderedSidePaneDatabaseId}
              onOpenPage={openSidePaneChildPage}
            />
          ) : renderedSidePanePageId ? (
            <PageWorkspaceGate pageId={renderedSidePanePageId}>
              <PageEditorPane
                databaseId={sidePaneDatabaseId}
                enableComments={false}
                key={renderedSidePanePageId}
                layoutPanelMode="overlay"
                onOpenPage={openSidePaneChildPage}
                pageId={renderedSidePanePageId}
              />
            </PageWorkspaceGate>
          ) : null
        ) : null;

  return (
    <AgentChatWorkspace
      externalSidePane={externalSidePane}
      externalSidePaneOpen={sidePaneAnimatedOpen}
      externalSidePaneVisible={Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)}
    />
  );
}
