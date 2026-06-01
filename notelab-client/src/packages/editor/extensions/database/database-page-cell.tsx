import { ExternalLink, FileText, X } from "lucide-react"

import { useOptionalWorkspaceSidePane } from "@/components/app-layout"
import { useWorkspace } from "@/features/workspaces/hooks"
import { getWorkspaceEmoji } from "@/features/workspaces/queries"

export function DatabasePageCell({
  onOpen,
  pageId,
}: {
  onOpen?: (pageId: string) => void
  pageId: string
}) {
  const sidePane = useOptionalWorkspaceSidePane()
  const { data: page, isLoading } = useWorkspace(pageId)
  const isOpen = sidePane?.sidePaneWorkspaceId === pageId
  const title = page?.name.trim() || "Untitled"
  const emoji = page ? getWorkspaceEmoji(page) : null
  const actionLabel = isOpen ? "Close" : "Open"
  const handleClick = () => {
    if (isOpen) {
      sidePane?.closeSidePane()
      return
    }

    onOpen?.(pageId)
  }

  return (
    <div className="database-page-link">
      <span className="database-page-main">
        <span className="database-page-icon">{emoji || <FileText />}</span>
        <span className="database-page-title">
          {!isLoading && !page
            ? "You don't have access to this block"
            : title}
        </span>
      </span>
      {page ? (
        <button
          className="database-page-open"
          onClick={handleClick}
          type="button"
        >
          {isOpen ? <X /> : <ExternalLink />}
          <span>{actionLabel}</span>
        </button>
      ) : null}
    </div>
  )
}
