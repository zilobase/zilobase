"use client"

import { DIFF_DELETE, DIFF_INSERT } from "diff-match-patch"

import {
  buildPageEditDiffSegments,
  hasPageEditDiffChanges,
} from "@/components/ai-elements/page-edit-diff"
import { cn } from "@/lib/utils"

export function PageEditDiffPanel({
  afterMarkdown,
  beforeMarkdown,
  className,
}: {
  afterMarkdown: string
  beforeMarkdown: string
  className?: string
}) {
  const segments = buildPageEditDiffSegments(
    beforeMarkdown,
    afterMarkdown,
  )
  const hasChanges = hasPageEditDiffChanges(segments)

  return (
    <div
      className={cn(
        "not-prose max-h-72 overflow-auto rounded-xl border bg-muted/20 p-3 text-sm leading-relaxed",
        className,
      )}
    >
      {hasChanges ? (
        <pre className="whitespace-pre-wrap break-words font-sans">
          {segments.map((segment, index) => (
            <span
              className={cn(
                segment.operation === DIFF_DELETE &&
                  "bg-destructive/15 text-destructive line-through decoration-destructive/70",
                segment.operation === DIFF_INSERT &&
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              )}
              key={`${segment.operation}-${index}`}
            >
              {segment.text}
            </span>
          ))}
        </pre>
      ) : (
        <p className="text-muted-foreground">No textual changes were recorded.</p>
      )}
    </div>
  )
}