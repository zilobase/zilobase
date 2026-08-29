"use client"

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  motion,
  Reorder,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion"
import {
  DatabaseIcon,
  HomeIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "@/shared/components/icons"

import { DefaultPageIcon, PageIconDisplay } from "@/lib/page-icon"
import { cn } from "@/shared/lib/utils"
import { isOpenInNewTabShortcut } from "@/app/shortcuts"
import type { DesktopTab } from "@/app/state/app-store"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { hasEditorBlockDragData } from "@/packages/editor/components/editor/block-drag-session"

type DesktopTabStripProps = {
  activeTabId: string | null
  macDesktopApp: boolean
  onCloneTab: (tab: DesktopTab) => void
  onCreateTab: () => void
  onRemoveTab: (tabId: string) => void
  onReorderTabs: (orderedTabIds: string[]) => void
  onSelectTab: (tab: DesktopTab) => void
  tabs: DesktopTab[]
}

export function DesktopTabStrip({
  activeTabId,
  macDesktopApp,
  onCloneTab,
  onCreateTab,
  onRemoveTab,
  onReorderTabs,
  onSelectTab,
  tabs,
}: DesktopTabStripProps) {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const trailingOffset = useMotionValue(0)
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs])

  const handleDragStart = useCallback((tabId: string) => {
    setDraggingTabId(tabId)
  }, [])
  const handleDragSettled = useCallback(
    (tabId: string) => {
      trailingOffset.set(0)
      setDraggingTabId((current) => (current === tabId ? null : current))
    },
    [trailingOffset],
  )
  const handleTrailingOffsetChange = useCallback(
    (offset: number) => trailingOffset.set(offset),
    [trailingOffset],
  )

  useEffect(() => {
    if (draggingTabId && !tabIds.includes(draggingTabId)) {
      trailingOffset.set(0)
      setDraggingTabId(null)
    }
  }, [draggingTabId, tabIds, trailingOffset])

  return (
    <div
      className="flex min-w-0 max-w-full shrink items-end self-stretch pt-1"
      data-desktop-tab-strip
      style={
        {
          "--desktop-tab-count": Math.max(tabs.length, 1),
        } as CSSProperties
      }
    >
      <Reorder.Group
        aria-label="Open tabs"
        as="div"
        axis="x"
        className={cn(
          "relative flex min-w-0 flex-1 self-stretch items-end gap-1",
          draggingTabId ? "overflow-visible" : "overflow-hidden",
        )}
        data-tauri-drag-region="deep"
        onReorder={onReorderTabs}
        role="tablist"
        values={tabIds}
      >
        {tabs.map((tab, index) => (
          <DesktopTabItem
            active={tab.id === activeTabId}
            key={tab.id}
            onClone={onCloneTab}
            onDragSettled={handleDragSettled}
            onDragStart={handleDragStart}
            onRemove={onRemoveTab}
            onSelect={onSelectTab}
            onTrailingOffsetChange={handleTrailingOffsetChange}
            tab={tab}
            trailing={index === tabs.length - 1}
          />
        ))}
        <DesktopNewTabButton
          macDesktopApp={macDesktopApp}
          offset={trailingOffset}
          onCreate={onCreateTab}
        />
      </Reorder.Group>
    </div>
  )
}

const DesktopTabItem = memo(function DesktopTabItem({
  active,
  onClone,
  onDragSettled,
  onDragStart,
  onRemove,
  onSelect,
  onTrailingOffsetChange,
  tab,
  trailing,
}: {
  active: boolean
  onClone: (tab: DesktopTab) => void
  onDragSettled: (tabId: string) => void
  onDragStart: (tabId: string) => void
  onRemove: (tabId: string) => void
  onSelect: (tab: DesktopTab) => void
  onTrailingOffsetChange: (offset: number) => void
  tab: DesktopTab
  trailing: boolean
}) {
  const x = useMotionValue(0)

  useMotionValueEvent(x, "change", (offset) => {
    if (trailing) onTrailingOffsetChange(offset)
  })

  useEffect(() => {
    if (trailing) onTrailingOffsetChange(x.get())
  }, [onTrailingOffsetChange, trailing, x])

  return (
    <Reorder.Item
      as="div"
      className={cn(
        "group/tab relative flex h-8 min-w-12 max-w-60 flex-[1_1_15rem] cursor-grab items-center px-1 text-sm active:cursor-grabbing",
        active
          ? "desktop-tab-active z-10 rounded-t-lg rounded-b-none border-x border-t border-border bg-background text-foreground"
          : "rounded-md text-muted-foreground hover:bg-backdrop hover:text-foreground",
      )}
      dragMomentum={false}
      onDragEnter={(event) => {
        if (hasEditorBlockDragData(event.dataTransfer)) onSelect(tab)
      }}
      onDragStart={() => onDragStart(tab.id)}
      onDragTransitionEnd={() => onDragSettled(tab.id)}
      style={{ x }}
      value={tab.id}
      whileDrag={{ zIndex: 30 }}
    >
      <DesktopTabButton
        active={active}
        onClone={() => onClone(tab)}
        onRemove={() => onRemove(tab.id)}
        onSelect={() => onSelect(tab)}
        tab={tab}
      />
      <button
        aria-label={`Close ${tab.title}`}
        className={cn(
          "shrink-0 rounded-sm p-1 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 active:bg-active active:text-active-foreground",
          active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
        )}
        onClick={() => onRemove(tab.id)}
        onPointerDown={stopReorderPointerDown}
        title="Close tab"
        type="button"
      >
        <XIcon className="size-3.5" />
      </button>
    </Reorder.Item>
  )
})

function DesktopNewTabButton({
  macDesktopApp,
  offset,
  onCreate,
}: {
  macDesktopApp: boolean
  offset: MotionValue<number>
  onCreate: () => void
}) {
  return (
    <motion.button
      aria-label="New tab"
      className="ml-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-backdrop hover:text-foreground"
      layout="position"
      onClick={onCreate}
      onPointerDown={stopReorderPointerDown}
      style={{ x: offset }}
      title={`New tab (${macDesktopApp ? "⌘T" : "Ctrl+T"})`}
      type="button"
    >
      <PlusIcon className="size-4" />
    </motion.button>
  )
}

function DesktopTabButton({
  active,
  onClone,
  onRemove,
  onSelect,
  tab,
}: {
  active: boolean
  onClone: () => void
  onRemove: () => void
  onSelect: () => void
  tab: DesktopTab
}) {
  const titleRef = useRef<HTMLSpanElement>(null)
  const [titleTruncated, setTitleTruncated] = useState(false)

  useEffect(() => {
    const titleElement = titleRef.current
    if (!titleElement) return

    const updateTruncatedState = () => {
      setTitleTruncated(titleElement.scrollWidth > titleElement.clientWidth)
    }
    const observer = new ResizeObserver(updateTruncatedState)

    updateTruncatedState()
    observer.observe(titleElement)
    return () => observer.disconnect()
  }, [tab.title])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-selected={active}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2"
          onAuxClick={(event) => {
            if (event.button === 1) onRemove()
          }}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            if (isOpenInNewTabShortcut(event)) {
              event.preventDefault()
              event.stopPropagation()
              onClone()
              return
            }

            onSelect()
          }}
          role="tab"
          type="button"
        >
          <DesktopTabIcon tab={tab} />
          <span className="min-w-0 flex-1 truncate" ref={titleRef}>
            {tab.title}
          </span>
        </button>
      </TooltipTrigger>
      {titleTruncated ? (
        <TooltipContent side="bottom" sideOffset={6}>
          {tab.title}
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}

function DesktopTabIcon({ tab }: { tab: DesktopTab }) {
  if (tab.icon) {
    return <PageIconDisplay className="size-4" size="sm" value={tab.icon} />
  }

  const Icon = tab.href.startsWith("/d/")
    ? DatabaseIcon
    : tab.href.startsWith("/p/")
      ? DefaultPageIcon
      : tab.href.startsWith("/settings")
        ? Settings2Icon
        : tab.href.startsWith("/ai")
          ? SparklesIcon
          : tab.href.startsWith("/trash")
            ? Trash2Icon
            : HomeIcon

  return <Icon className="size-4 shrink-0" />
}

function stopReorderPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
  event.stopPropagation()
}
