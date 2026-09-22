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

import { DefaultPageIcon, PageIconDisplay } from "@/features/pages/index"
import { cn } from "@/shared/lib/utils"
import { isOpenInNewTabShortcut } from "@/shared/shortcuts"
import type { DesktopTab } from "@/features/desktop/state/app-store"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
import { hasEditorBlockDragData } from "@/features/editor/drag-drop/block-drag-session"

type DesktopTabStripProps = {
  activeTabId: string | null
  macDesktopApp: boolean
  onCloneTab: (tab: DesktopTab) => void
  onCreateTab: () => void
  onPreloadTab: (tab: DesktopTab) => void
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
  onPreloadTab,
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
          "relative flex min-w-0 flex-1 self-stretch items-end gap-2.5 pl-1.5",
          draggingTabId ? "overflow-visible" : "overflow-hidden",
        )}
        data-desktop-drag-region=""
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
            onPreload={onPreloadTab}
            onRemove={onRemoveTab}
            onSelect={onSelectTab}
            onTrailingOffsetChange={handleTrailingOffsetChange}
            preloadEnabled={!draggingTabId}
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
  onPreload,
  onRemove,
  onSelect,
  onTrailingOffsetChange,
  preloadEnabled,
  tab,
  trailing,
}: {
  active: boolean
  onClone: (tab: DesktopTab) => void
  onDragSettled: (tabId: string) => void
  onDragStart: (tabId: string) => void
  onPreload: (tab: DesktopTab) => void
  onRemove: (tabId: string) => void
  onSelect: (tab: DesktopTab) => void
  onTrailingOffsetChange: (offset: number) => void
  preloadEnabled: boolean
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
        "desktop-tab-item group/tab relative flex h-8 min-w-12 max-w-56 flex-[1_1_14rem] cursor-grab items-center rounded-t-md px-1 text-[13px] leading-none select-none active:cursor-grabbing",
        active
          ? "desktop-tab-active z-10 font-medium text-content-primary"
          : "desktop-tab-inactive rounded-b-md text-content-primary hover:text-content-primary",
      )}
      dragElastic={0.04}
      dragMomentum={false}
      onDragEnter={(event) => {
        if (hasEditorBlockDragData(event.dataTransfer)) onSelect(tab)
      }}
      onDragStart={() => onDragStart(tab.id)}
      onDragTransitionEnd={() => onDragSettled(tab.id)}
      style={{ x }}
      transition={{ layout: { type: "spring", stiffness: 700, damping: 48 } }}
      value={tab.id}
      whileDrag={{ zIndex: 30 }}
    >
      <DesktopTabButton
        active={active}
        onClone={() => onClone(tab)}
        onPreload={() => {
          if (preloadEnabled) onPreload(tab)
        }}
        onRemove={() => onRemove(tab.id)}
        onSelect={() => onSelect(tab)}
        tab={tab}
      />
      <button
        aria-label={`Close ${tab.title}`}
        className="desktop-tab-close flex size-6 shrink-0 items-center justify-center rounded-md text-content-secondary hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral"
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
      className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-content-secondary hover:bg-effect-backdrop hover:text-content-primary"
      layout="position"
      onClick={onCreate}
      onPointerDown={stopReorderPointerDown}
      style={{ x: offset }}
      title={`New tab (${macDesktopApp ? "⌘T" : "Ctrl+T"})`}
      transition={{ layout: { type: "spring", stiffness: 700, damping: 48 } }}
      type="button"
    >
      <PlusIcon className="size-4" />
    </motion.button>
  )
}

function DesktopTabButton({
  active,
  onClone,
  onPreload,
  onRemove,
  onSelect,
  tab,
}: {
  active: boolean
  onClone: () => void
  onPreload: () => void
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
          className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden pl-2 pr-1 text-left focus-visible:rounded-md"
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
          onFocus={onPreload}
          onPointerDown={(event) => {
            if (
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey
            ) onSelect()
          }}
          onPointerEnter={onPreload}
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
