import { EmbeddedPageDialog } from "@/features/pages/pane/embedded-page-dialog";
import { useOpenEmbeddedPage } from "@/features/pages/pane/use-open-embedded-page";
import { PageEditorPane } from "@/features/pages/pane/page-editor-pane";
import { usePage } from "@zilobase/features/pages/react";

export function EmbeddedPageDialogHost({
  contextPageId,
  databaseId,
  hostPage,
}: {
  contextPageId: string | null;
  databaseId: string | null;
  hostPage: ReturnType<typeof usePage>["data"];
}) {
  const { openPage } = useOpenEmbeddedPage({
    contextPageId,
    databaseId,
    page: hostPage,
  });

  return <EmbeddedPageDialog onOpenPage={openPage} pageRenderer={PageEditorPane} />;
}
