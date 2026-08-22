"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface Tab {
  title: string
  icon: LucideIcon
  type?: never
}

interface TabSeparator {
  type: "separator"
  title?: never
  icon?: never
}

export type ExpandableTabItem = Tab | TabSeparator

interface ExpandableTabsProps
  extends Omit<React.ComponentProps<"div">, "onChange"> {
  tabs: ExpandableTabItem[]
  selected?: number | null
  defaultSelected?: number | null
  activeColor?: string
  onChange?: (index: number | null) => void
}

const buttonVariants = {
  initial: {
    gap: 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? ".5rem" : 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  }),
}

const labelVariants = {
  initial: { opacity: 0, width: 0 },
  animate: { opacity: 1, width: "auto" },
  exit: { opacity: 0, width: 0 },
}

const transition = {
  bounce: 0,
  delay: 0.05,
  duration: 0.45,
  type: "spring" as const,
}

export function ExpandableTabs({
  tabs,
  selected: selectedProp,
  defaultSelected = null,
  activeColor = "text-foreground dark:text-foreground!",
  onChange,
  className,
  ...props
}: ExpandableTabsProps) {
  const [internalSelected, setInternalSelected] =
    React.useState<number | null>(defaultSelected)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const isControlled = selectedProp !== undefined
  const selected = isControlled ? selectedProp : internalSelected

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return
      }

      if (!isControlled) {
        setInternalSelected(null)
      }
      onChange?.(null)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [isControlled, onChange])

  const handleSelect = (index: number) => {
    if (!isControlled) {
      setInternalSelected(index)
    }
    onChange?.(index)
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex h-8 items-center gap-0.5 text-muted-foreground",
        className,
      )}
      {...props}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return (
            <div
              aria-hidden="true"
              className="mx-1 h-6 w-px bg-sidebar-border"
              key={`separator-${index}`}
            />
          )
        }

        const Icon = tab.icon
        const isSelected = selected === index

        return (
          <motion.button
            animate="animate"
            aria-current={isSelected ? "page" : undefined}
            aria-label={tab.title}
            className={cn(
              "relative inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent py-0.5 text-xs font-medium text-muted-foreground outline-none transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring dark:text-muted-foreground dark:hover:text-foreground",
              isSelected
                ? cn("bg-active", activeColor)
                : undefined,
            )}
            custom={isSelected}
            initial={false}
            key={tab.title}
            onClick={() => handleSelect(index)}
            transition={transition}
            type="button"
            variants={buttonVariants}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <AnimatePresence initial={false}>
              {isSelected ? (
                <motion.span
                  animate="animate"
                  className="overflow-hidden"
                  exit="exit"
                  initial="initial"
                  transition={transition}
                  variants={labelVariants}
                >
                  {tab.title}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
        )
      })}
    </div>
  )
}
