import {
  useEffect,
  useRef,
  useState,
} from "react"
import { DatabaseIcon, ExternalLink, FileText, X } from "lucide-react"
import { toast } from "sonner"

import { useOptionalPageSidePane } from "@/contexts/page-side-pane"
import {
  getPageEmoji,
  useUpdatePage,
  type PageMetadata,
} from "@zilobase/features/pages"
import { PageIconDisplay } from "@/lib/page-icon"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useOptionalUndoHistory } from "@/shortcuts"

type DatabasePageSummary = {
  iconKind?: "database" | "page"
  id?: string
  name?: string
  metadata?: PageMetadata | null | unknown
}

export function DatabasePageLink({
  editable = false,
  onActiveChange,
  onOpen,
  openMode = "button",
  pageId,
  pageSummary,
  showPageIcon = true,
}: {
  editable?: boolean
  onActiveChange?: (active: boolean) => void
  onOpen?: (pageId: string) => void
  openMode?: "button" | "title"
  pageId: string
  pageSummary?: DatabasePageSummary | null
  showPageIcon?: boolean
}) {
  const sidePane = useOptionalPageSidePane()
  const updatePage = useUpdatePage()
  const undoHistory = useOptionalUndoHistory()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const titleEditFinishedRef = useRef(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const targetPageId = pageSummary?.id ?? pageId
  const isOpen =
    sidePane?.sidePanePageId === targetPageId ||
    sidePane?.dialogPageId === targetPageId
  const title = pageSummary?.name?.trim() || "Untitled"
  const emoji = pageSummary
    ? getPageEmoji({
        metadata: pageSummary.metadata as PageMetadata | null | undefined,
      })
    : null
  const icon =
    emoji ? (
      <PageIconDisplay size="sm" value={emoji} />
    ) : pageSummary?.iconKind === "database" ? (
      <DatabaseIcon />
    ) : (
      <FileText />
    )
  const actionLabel = isOpen ? "Close" : "Open"
  const canEditTitle = editable && Boolean(pageSummary)

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(pageSummary?.name ?? "")
    }
  }, [isEditingTitle, pageSummary?.name])

  const handleClick = (event?: { stopPropagation: () => void }) => {
    event?.stopPropagation()

    if (isOpen) {
      if (sidePane?.dialogPageId === targetPageId) {
        sidePane.closeEmbeddedPageDialog()
      } else {
        sidePane?.closeSidePane()
      }
      return
    }

    onOpen?.(pageId)
  }
  const startTitleEdit = () => {
    if (!pageSummary || !canEditTitle) {
      return
    }

    setDraftTitle(pageSummary.name ?? "")
    titleEditFinishedRef.current = false
    onActiveChange?.(true)
    setIsEditingTitle(true)
  }
  const cancelTitleEdit = () => {
    titleEditFinishedRef.current = true
    setDraftTitle(pageSummary?.name ?? "")
    onActiveChange?.(false)
    setIsEditingTitle(false)
  }
  const commitTitleEdit = () => {
    if (titleEditFinishedRef.current) {
      return
    }

    titleEditFinishedRef.current = true

    if (!pageSummary) {
      onActiveChange?.(false)
      setIsEditingTitle(false)
      return
    }

    const nextTitle = draftTitle.trim()

    onActiveChange?.(false)
    setIsEditingTitle(false)

    const currentTitle = pageSummary.name ?? ""

    if (nextTitle === currentTitle) {
      setDraftTitle(currentTitle)
      return
    }

    if (undoHistory?.shouldRecord()) {
      undoHistory.pushAction({
        label: "Rename database page",
        redo: () => {
          updatePage.mutate({ id: pageId, name: nextTitle })
        },
        undo: () => {
          updatePage.mutate({ id: pageId, name: currentTitle })
        },
      })
    }

    updatePage.mutate(
      { id: pageId, name: nextTitle },
      {
        onError: () => {
          setDraftTitle(currentTitle)
          toast.error("Couldn't rename page")
        },
      }
    )
  }
  const resizeTitleTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }

  return (
    <div className="database-page-link">
      <span className="database-page-main">
        {showPageIcon ? (
          <span className="database-page-icon">
            {icon}
          </span>
        ) : null}
        {canEditTitle ? (
          <Popover
            open={isEditingTitle}
            onOpenChange={(open) => {
              if (open) {
                startTitleEdit()
                return
              }

              commitTitleEdit()
            }}
          >
            <PopoverTrigger asChild>
              <button
                className="database-page-title database-page-title-button"
                onClick={(event) => event.stopPropagation()}
                title="Edit page title"
                type="button"
              >
                {title}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="database-input-cell-popover w-72 p-0"
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                requestAnimationFrame(() => {
                  const element = textareaRef.current

                  if (!element) return

                  element.focus()
                  element.setSelectionRange(
                    element.value.length,
                    element.value.length
                  )
                  resizeTitleTextarea(element)
                })
              }}
              sideOffset={0}
            >
              <div
                className="database-input-cell-wrap"
                data-popover-open="true"
              >
                <textarea
                  aria-label="Page title"
                  className="database-input-cell"
                  data-database-cell-input
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onFocus={() => onActiveChange?.(true)}
                  onInput={(event) =>
                    resizeTitleTextarea(event.currentTarget)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault()
                      cancelTitleEdit()
                      return
                    }

                    if (event.key !== "Enter") return

                    event.preventDefault()
                    commitTitleEdit()
                  }}
                  ref={textareaRef}
                  rows={1}
                  value={draftTitle}
                  wrap="soft"
                />
              </div>
            </PopoverContent>
          </Popover>
        ) : openMode === "title" ? (
          <button
            className="database-page-title database-page-title-link"
            onClick={handleClick}
            type="button"
          >
            {title}
          </button>
        ) : (
          <span className="database-page-title">{title}</span>
        )}
      </span>
      {pageSummary && !isEditingTitle && openMode === "button" ? (
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
