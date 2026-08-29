import { lazy, Suspense } from "react";

import { PageWorkspaceGate } from "@/features/workspaces";
import { PageSidePaneLayout, usePageSidePane } from "@/contexts/page-side-pane";
import { useAiChatThreadState } from "@/hooks/use-ai-chat-thread-state";
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page";
import { DatabaseMainPane } from "@/pages/database";
import { PageEditorPane } from "@/pages/page";

const Chatbot = lazy(() => import("@/components/ai-elements/chatbot"));

export default function AiPage() {
  const { activeThreadId, isBootstrapping, setActiveThreadId } =
    useAiChatThreadState();
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

  return (
    <PageSidePaneLayout
      main={
        <div className="h-full min-h-0 overflow-hidden">
          <main className="box-border flex h-full min-h-0 overflow-hidden px-4 py-4 md:py-6">
            <section className="mx-auto h-full min-h-0 w-full max-w-6xl overflow-hidden">
              {isBootstrapping ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Loading chat...
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      Loading chat...
                    </div>
                  }
                >
                  <Chatbot
                    key={activeThreadId ?? "new"}
                    onThreadCreated={setActiveThreadId}
                    threadId={activeThreadId}
                  />
                </Suspense>
              )}
            </section>
          </main>
        </div>
      }
      sidePane={
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
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={Boolean(
        renderedSidePanePageId || renderedSidePaneDatabaseId,
      )}
    />
  );
}
