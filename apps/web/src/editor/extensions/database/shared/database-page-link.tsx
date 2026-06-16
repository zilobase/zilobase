import {
  useEffect,
  useRef,
  useState,
} from "react"
import { ExternalLink, FileText, X } from "lucide-react"
import { toast } from "sonner"

import { useOptionalWorkspaceSidePane } from "@/components/app-layout"
import {
  getWorkspaceEmoji,
  useUpdateWorkspace,
  useWorkspace,
} from "@notelab/features/workspaces"

export function DatabasePageLink({
  editable = false,
  onActiveChange,
  onOpen,
  pageId,
  showPageIcon = true,
}: {
  editable?: boolean
  onActiveChange?: (active: boolean) => void
  onOpen?: (pageId: string) => void
  pageId: string
  showPageIcon?: boolean
}) {
  const sidePane = useOptionalWorkspaceSidePane()
  const { data: page, isLoading } = useWorkspace(pageId)
  const updateWorkspace = useUpdateWorkspace()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const titleEditFinishedRef = useRef(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const isOpen = sidePane?.sidePaneWorkspaceId === pageId
  const title = page?.name.trim() || "Untitled"
  const emoji = page ? getWorkspaceEmoji(page) : null
  const actionLabel = isOpen ? "Close" : "Open"
  const canEditTitle = editable && Boolean(page)

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(page?.name ?? "")
    }
  }, [isEditingTitle, page?.name])

  useEffect(() => {
    if (!isEditingTitle) {
      return
    }

    const inputElement = inputRef.current

    if (!inputElement) {
      return
    }

    inputElement.focus()
    inputElement.select()
  }, [isEditingTitle])

  const handleClick = () => {
    if (isOpen) {
      sidePane?.closeSidePane()
      return
    }

    onOpen?.(pageId)
  }
  const startTitleEdit = () => {
    if (!page || !canEditTitle) {
      return
    }

    setDraftTitle(page.name)
    titleEditFinishedRef.current = false
    onActiveChange?.(true)
    setIsEditingTitle(true)
  }
  const cancelTitleEdit = () => {
    titleEditFinishedRef.current = true
    setDraftTitle(page?.name ?? "")
    onActiveChange?.(false)
    setIsEditingTitle(false)
  }
  const commitTitleEdit = () => {
    if (titleEditFinishedRef.current) {
      return
    }

    titleEditFinishedRef.current = true

    if (!page) {
      onActiveChange?.(false)
      setIsEditingTitle(false)
      return
    }

    const nextTitle = draftTitle.trim()

    onActiveChange?.(false)
    setIsEditingTitle(false)

    if (nextTitle === page.name) {
      setDraftTitle(page.name)
      return
    }

    updateWorkspace.mutate(
      { id: page.id, name: nextTitle },
      {
        onError: () => {
          setDraftTitle(page.name)
          toast.error("Couldn't rename page")
        },
      }
    )
  }

  return (
    <div className="database-page-link">
      <span className="database-page-main">
        {showPageIcon ? (
          <span className="database-page-icon">{emoji || <FileText />}</span>
        ) : null}
        {isEditingTitle ? (
          <input
            aria-label="Page title"
            className="database-page-title-input"
            onBlur={commitTitleEdit}
            onChange={(event) => setDraftTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => onActiveChange?.(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                cancelTitleEdit()
                return
              }

              if (event.key !== "Enter") {
                return
              }

              event.preventDefault()
              commitTitleEdit()
            }}
            ref={inputRef}
            value={draftTitle}
          />
        ) : canEditTitle ? (
          <button
            className="database-page-title database-page-title-button"
            onClick={(event) => {
              event.stopPropagation()
              startTitleEdit()
            }}
            title="Edit page title"
            type="button"
          >
            {title}
          </button>
        ) : (
          <span className="database-page-title">
            {!isLoading && !page
              ? "You don't have access to this block"
              : title}
          </span>
        )}
      </span>
      {page && !isEditingTitle ? (
        <button
          aria-label={`${actionLabel} ${title}`}
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
