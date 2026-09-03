import { EmbeddedPageDialog } from "@/features/pages/components/embedded-page-dialog"
import { useOpenEmbeddedPage } from "@/features/pages/hooks/use-open-embedded-page"
import { PageEditorPane } from "@/features/pages/pages/page"
import { usePage } from "@zilobase/features/pages"

export function EmbeddedPageDialogHost({
  contextPageId,
  databaseId,
  hostPage,
}: {
  contextPageId: string | null
  databaseId: string | null
  hostPage: ReturnType<typeof usePage>["data"]
}) {
  const { openPage } = useOpenEmbeddedPage({
    contextPageId,
    databaseId,
    page: hostPage,
  })

  return (
    <EmbeddedPageDialog
      onOpenPage={openPage}
      pageRenderer={PageEditorPane}
    />
  )
}
