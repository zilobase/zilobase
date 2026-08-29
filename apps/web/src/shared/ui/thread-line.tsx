"use client"

import * as React from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Reusable vertical thread line for stacked avatars (comment threads, etc).
 *
 * Place <ThreadLine /> inside a position:relative container.
 * Wrap every avatar column you want connected with <ThreadAvatar>.
 *
 * Renders a single continuous 1px line spanning from (slightly above) the vertical center
 * of the first avatar to the center of the last avatar. Avatar circles (solid bg) interrupt
 * the line visually at each dot — the classic threaded look.
 *
 * Place ThreadLine in the same position:relative container as all ThreadAvatar elements
 * (including the reply composer) so a single continuous line spans the full thread.
 *
 * The component re-measures on parent re-renders (when comments/reactions change) and has
 * a ResizeObserver hook for robustness.
 */
interface ThreadLineProps extends React.HTMLAttributes<HTMLDivElement> {}

function measureThreadLine(lineEl: HTMLDivElement) {
  const container = lineEl.parentElement
  if (!container) {
    lineEl.style.top = "0px"
    lineEl.style.height = "0px"
    return
  }

  const avatarEls = container.querySelectorAll<HTMLElement>("[data-thread-avatar]")

  if (avatarEls.length < 2) {
    lineEl.style.top = "0px"
    lineEl.style.height = "0px"
    return
  }

  const cRect = container.getBoundingClientRect()
  let minCenter = Infinity
  let maxCenter = -Infinity

  avatarEls.forEach((el) => {
    const target =
      el.querySelector<HTMLElement>('[data-slot="avatar"]') ?? el
    const r = target.getBoundingClientRect()
    const center = r.top + r.height / 2 - cRect.top
    if (center < minCenter) minCenter = center
    if (center > maxCenter) maxCenter = center
  })

  if (minCenter === Infinity) {
    lineEl.style.top = "0px"
    lineEl.style.height = "0px"
    return
  }

  // Single continuous line from slightly above the first avatar center
  // to the last avatar center. The avatar circles (with solid background)
  // sit on top and interrupt the line visually. This gives a clean single
  // thread line without overlapping segment artifacts.
  const lead = 4
  const top = Math.max(0, minCenter - lead)
  const height = Math.max(2, maxCenter - (minCenter - lead) - 1)

  lineEl.style.top = `${top}px`
  lineEl.style.height = `${height}px`
}

export const ThreadLine = React.forwardRef<HTMLDivElement, ThreadLineProps>(
  ({ className }, ref) => {
    const lineRef = React.useRef<HTMLDivElement>(null)
    const measureRef = React.useRef(measureThreadLine)

    measureRef.current = measureThreadLine

    React.useLayoutEffect(() => {
      const lineEl = lineRef.current
      if (!lineEl) return
      measureRef.current(lineEl)
    })

    // ResizeObserver for robustness when content heights change (reactions etc.)
    React.useLayoutEffect(() => {
      const lineEl = lineRef.current
      if (!lineEl) return

      const container = lineEl.parentElement
      if (!container) return

      const ro = new ResizeObserver(() => {
        if (lineRef.current) {
          measureRef.current(lineRef.current)
        }
      })

      ro.observe(container)

      return () => {
        ro.disconnect()
      }
    }, [])

    return (
      <div
        ref={(node) => {
          if (typeof ref === "function") ref(node)
          else if (ref) (ref as any).current = node
          lineRef.current = node
        }}
        className={cn("absolute left-3 z-0 w-px bg-indicator-muted pointer-events-none", className)}
      />
    )
  }
)

ThreadLine.displayName = "ThreadLine"

/** Convenience wrapper that marks the column for the thread line + applies correct sizing. */
export function ThreadAvatar({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-thread-avatar
      className={cn("relative z-10 flex w-6 shrink-0 justify-center overflow-visible", className)}
      {...props}
    >
      {children}
    </div>
  )
}
