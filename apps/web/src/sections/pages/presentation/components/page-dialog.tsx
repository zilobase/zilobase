import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  usePageSidePane,
  getFullPagePath,
} from "@/sections/pages/presentation/components/page-presentation";
import { PageWorkspaceGate } from "@/sections/workspaces/access/components/page-workspace-gate";
import { useOptionalPageDesignSidebar } from "../../design/components/page-design-sidebar";
import { PageLayout } from "../../layout/components/page-layout";
import { PageContent } from "../../editor/page-content";
import { useOpenEmbeddedPage } from "../../navigation/hooks/page-navigation";
import { isMobileViewport, useIsMobile } from "@/hooks/use-mobile";
import type { OpenPageOptions } from "../../navigation/hooks/page-navigation";
import type { usePage } from "@zilobase/features/pages/react";

export function PageDialog({
  onOpenPage,
  contextPageId = null,
  databaseId,
  hostPage,
  readOnly = false,
}: {
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void;
  contextPageId?: string | null;
  databaseId?: string | null;
  hostPage?: ReturnType<typeof usePage>["data"];
  readOnly?: boolean;
}) {
  const { openPage } = useOpenEmbeddedPage({ contextPageId, databaseId, page: hostPage });
  const { closeEmbeddedPageDialog, dialogDatabaseId, dialogPageId, dialogFocusTitle } =
    usePageSidePane();
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!dialogPageId || !dialogFocusTitle || !panel || readOnly) return;
    const focus = () => {
      const title = panel.querySelector<HTMLTextAreaElement>('textarea[aria-label="Page title"]');
      if (!title || title.readOnly) return false;
      title.focus({ preventScroll: true });
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => {
      if (focus()) observer.disconnect();
    });
    observer.observe(panel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["readonly"],
    });
    return () => observer.disconnect();
  }, [dialogPageId, dialogFocusTitle, readOnly, panel]);
  const pageLayoutSidebar = useOptionalPageDesignSidebar();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeDialog = () => {
    if (pageLayoutSidebar?.overlayPageId === dialogPageId) {
      pageLayoutSidebar.closeOverlay();
    }
    closeEmbeddedPageDialog();
  };

  if (isMobile || isMobileViewport()) return null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
      open={dialogPageId !== null}
    >
      <DialogContent
        ref={setPanel}
        className="flex h-[90dvh] max-h-[90dvh] min-h-0 w-full flex-col gap-0 overflow-hidden p-0 dark:bg-surface-navigation sm:h-[90vh] sm:max-h-[90vh] sm:max-w-4xl"
        data-page-dialog-panel
        onOpenAutoFocus={(event) => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (dialogFocusTitle) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus({ preventScroll: true });
          }
        }}
        hideMobileDragHandle
        showCloseButton={false}
        unstyledContent
      >
        <DialogTitle className="sr-only">Page preview</DialogTitle>
        <DialogDescription className="sr-only">Page preview</DialogDescription>
        {dialogPageId ? (
          <PageLayout
            pageId={dialogPageId}
            placement="dialog"
            rowNavigationDatabaseId={dialogDatabaseId}
            onClose={closeDialog}
            onOpenFullPage={() => {
              closeDialog();
              void navigate({ to: getFullPagePath(dialogPageId) });
            }}
          >
            <PageWorkspaceGate pageId={dialogPageId}>
              <PageContent
                databaseId={dialogDatabaseId}
                key={dialogPageId}
                layoutPanelMode="overlay"
                onOpenPage={onOpenPage ?? openPage}
                pageId={dialogPageId}
                readOnly={readOnly}
              />
            </PageWorkspaceGate>
          </PageLayout>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
