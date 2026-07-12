import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { FileText, LinkIcon, Loader2, Plus } from "lucide-react"
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  getPageEmoji,
  usePages,
  type Page,
} from "@notelab/features/pages"
import { useNotelabFeatures } from "@notelab/features"
import {
  databaseRootQueryKey,
  type DatabasePayload,
} from "@notelab/features/databases"
import { colorWithAlpha, getPaletteColor } from "@/lib/color-tokens"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"

export type CreatedPage = {
  id: string
}

export type PageBlockOptions = {
  currentPageId?: string | null
  onCreatePage?: () => Promise<CreatedPage>
  onEmbedPage?: (pageId: string) => void | Promise<void>
  onOpenPage?: (pageId: string) => void
  workspaceId?: string | null
}

type PageSummary = Pick<Page, "id" | "metadata" | "name">

function findCachedDatabaseRowPage(
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
  pageId: string | null,
): PageSummary | null {
  if (!pageId) {
    return null
  }

  for (const [, data] of queryClient.getQueriesData<DatabasePayload>({
    queryKey: databaseRootQueryKey(),
  })) {
    const row = data?.rows.find((item) => item.pageId === pageId)

    if (row) {
      return row.page as PageSummary
    }
  }

  return null
}

function useCachedDatabaseRowPage(pageId: string | null) {
  const { queryClient } = useNotelabFeatures()

  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => findCachedDatabaseRowPage(queryClient, pageId),
    () => null,
  )
}

function PageBlockView({
  extension,
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const [isCreating, setIsCreating] = useState(false)
  const pageId = node.attrs.pageId as string | null
  const shouldOpenPicker = Boolean(node.attrs.openPicker)
  const textColor = node.attrs.textColor as string | null
  const backgroundColor = node.attrs.backgroundColor as string | null
  const [isOpen, setIsOpen] = useState(shouldOpenPicker)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const options = extension.options as PageBlockOptions
  const { data: pages = [] } = usePages(
    options.workspaceId,
    {
      enabled: Boolean(pageId) || isOpen,
    },
  )
  const navPage = pageId
    ? pages.find((page) => page.id === pageId)
    : undefined
  const rowPage = useCachedDatabaseRowPage(pageId)
  const page = navPage ?? rowPage ?? undefined
  const title = page?.name.trim() || "Untitled"
  const emoji = page ? getPageEmoji(page) : null
  const linkablePages = pages.filter(
    (page) => page.id !== options.currentPageId
  )
  const optionCount = linkablePages.length + (options.onCreatePage ? 1 : 0)
  const cardStyle = {
    ...(backgroundColor
      ? { backgroundColor: colorWithAlpha(backgroundColor, 0.18) ?? undefined }
      : {}),
    ...(textColor ? { color: getPaletteColor(textColor) ?? undefined } : {}),
  }

  useEffect(() => {
    if (!shouldOpenPicker || pageId) {
      return
    }

    setIsOpen(true)
    updateAttributes({
      openPicker: false,
    })
  }, [pageId, shouldOpenPicker, updateAttributes])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setSelectedIndex(0)
  }, [isOpen, linkablePages.length])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    optionRefs.current[selectedIndex]?.focus()
  }, [isOpen, selectedIndex])

  const createPage = async () => {
    if (!options.onCreatePage || isCreating) {
      return
    }

    setIsCreating(true)

    try {
      const page = await options.onCreatePage()

      updateAttributes({
        pageId: page.id,
      })
      setIsOpen(false)
      options.onOpenPage?.(page.id)
    } finally {
      setIsCreating(false)
    }
  }

  const linkPage = async (nextPageId: string) => {
    if (nextPageId === options.currentPageId) {
      return
    }

    try {
      await options.onEmbedPage?.(nextPageId)
      updateAttributes({
        pageId: nextPageId,
      })
      setIsOpen(false)
    } catch {
      // Keep the picker open when the embed is rejected.
    }
  }

  const openPage = () => {
    if (pageId) {
      options.onOpenPage?.(pageId)
    }
  }

  const startPageDrag = (event: DragEvent<HTMLButtonElement>) => {
    if (!pageId) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = "copyMove"
    event.dataTransfer.setData(
      DATABASE_PAGE_DRAG_MIME,
      JSON.stringify({
        pageId,
        title,
      })
    )
    event.dataTransfer.setData("text/plain", title)
  }

  const selectOption = (index: number) => {
    const linkedPage = linkablePages[index]

    if (linkedPage) {
      linkPage(linkedPage.id)
      return
    }

    if (index === linkablePages.length) {
      void createPage()
    }
  }

  const handlePickerKeyDown = (event: KeyboardEvent) => {
    if (optionCount === 0) {
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setSelectedIndex((index) => (index + 1) % optionCount)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setSelectedIndex((index) => (index + optionCount - 1) % optionCount)
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      setSelectedIndex(0)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      setSelectedIndex(optionCount - 1)
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      selectOption(selectedIndex)
    }
  }

  return (
    <NodeViewWrapper
      className="page-block"
      data-page-id={pageId ?? undefined}
      data-src={pageId ? "true" : "false"}
    >
      {pageId ? (
        <button
          className="flex h-10 w-full items-center gap-2 rounded-md bg-muted/50 px-3 text-left text-sm text-foreground transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
          contentEditable={false}
          draggable
          onClick={openPage}
          onDragStart={startPageDrag}
          style={cardStyle}
          type="button"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            {emoji || <FileText />}
          </span>
          <span className="min-w-0 truncate font-medium">
            {title}
          </span>
        </button>
      ) : (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              className="flex h-10 w-full justify-start gap-2 rounded-md bg-muted/50 px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
              contentEditable={false}
              style={cardStyle}
              type="button"
              variant="ghost"
            >
              <LinkIcon />
              <span>Link to page</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            avoidCollisions
            className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto p-2"
            collisionPadding={8}
            onKeyDown={handlePickerKeyDown}
            side="bottom"
            sideOffset={6}
          >
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Pages
            </div>
            <div className="grid gap-1">
              {linkablePages.length > 0 ? (
                linkablePages.map((page, index) => {
                  const pageTitle = page.name.trim() || "Untitled"
                  const pageEmoji = getPageEmoji(page)

                  return (
                    <button
                      className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      data-selected={selectedIndex === index ? true : undefined}
                      key={page.id}
                      onClick={() => linkPage(page.id)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      ref={(element) => {
                        optionRefs.current[index] = element
                      }}
                      type="button"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
                        {pageEmoji || <FileText />}
                      </span>
                      <span className="min-w-0 truncate">{pageTitle}</span>
                    </button>
                  )
                })
              ) : (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No other pages yet.
                </div>
              )}
            </div>
            {options.onCreatePage ? (
              <>
                <div className="my-1 h-px bg-border" />
                <Button
                  className="mt-1 flex h-8 w-full justify-start gap-2 px-2 text-xs data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4"
                  data-selected={
                    selectedIndex === linkablePages.length ? true : undefined
                  }
                  disabled={isCreating}
                  onClick={createPage}
                  onMouseEnter={() => setSelectedIndex(linkablePages.length)}
                  ref={(element) => {
                    optionRefs.current[linkablePages.length] = element
                  }}
                  type="button"
                  variant="ghost"
                >
                  {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                  <span>
                    {isCreating ? "Creating page..." : "Create nested page"}
                  </span>
                </Button>
              </>
            ) : null}
          </PopoverContent>
        </Popover>
      )}
    </NodeViewWrapper>
  )
}

export const PageBlock = Node.create<PageBlockOptions>({
  name: "pageBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addOptions() {
    return {
      currentPageId: null,
      onCreatePage: undefined,
      onEmbedPage: undefined,
      onOpenPage: undefined,
      workspaceId: null,
    }
  },

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-page-id"),
        renderHTML: (attributes) =>
          attributes.pageId ? { "data-page-id": attributes.pageId } : {},
      },
      textColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-text-color"),
        renderHTML: (attributes) =>
          attributes.textColor ? { "data-text-color": attributes.textColor } : {},
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-background-color"),
        renderHTML: (attributes) =>
          attributes.backgroundColor
            ? { "data-background-color": attributes.backgroundColor }
            : {},
      },
      openPicker: {
        default: false,
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="pageBlock"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "pageBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBlockView)
  },
})
