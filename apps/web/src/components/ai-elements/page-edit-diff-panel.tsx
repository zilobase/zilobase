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
        "not-prose max-h-72 overflow-auto rounded-xl border bg-subtle-surface p-3 text-sm leading-relaxed",
        className,
      )}
    >
      {hasChanges ? (
        <pre className="whitespace-pre-wrap break-words font-sans">
          {segments.map((segment, index) => (
            <span
              className={cn(
                segment.operation === DIFF_DELETE &&
                  "bg-status-danger-diff-surface text-destructive line-through decoration-destructive",
                segment.operation === DIFF_INSERT &&
                  "bg-status-success-surface text-status-success-foreground ",
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