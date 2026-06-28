"use client"

import { Button } from "@/components/ui/button"
import {
  isStalePageEditResolveError,
  type PageEditSnapshotPart,
} from "@notelab/features/ai-chat"
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  FilePenLineIcon,
  Loader2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { useState } from "react"

export function PageEditCard({
  isApplying,
  isBaselineCurrent,
  isDiffVisible,
  isReviewAvailable,
  onApply,
  onDiscard,
  onToggleChanges,
  onUndo,
  snapshot,
  summary,
  toolError = null,
}: {
  isApplying: boolean
  isBaselineCurrent: boolean
  isDiffVisible: boolean
  isReviewAvailable: boolean
  onApply: () => void | Promise<void>
  onDiscard: () => void | Promise<void>
  onToggleChanges: () => void
  onUndo: () => void | Promise<void>
  snapshot: PageEditSnapshotPart | null
  summary: string
  toolError?: string | null
}) {
  const [isApplyingEdit, setIsApplyingEdit] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)

  const isPreview = snapshot?.status === "preview"
  const isDeclined = snapshot?.status === "declined"
  const isApplied = snapshot?.status === "applied"
  const isUndone = snapshot?.status === "undone"
  const pageChangedSinceSuggestion =
    Boolean(snapshot) && !isBaselineCurrent && (isPreview || isDeclined)
  const pageChangedSinceApplied = isApplied && !isReviewAvailable
  const pageChangedSinceUndo = isUndone && !isReviewAvailable
  const canReviewChanges = isReviewAvailable && Boolean(snapshot?.afterMarkdown)
  const canApply =
    (isPreview || isUndone) && isReviewAvailable && !isApplying
  const canDiscard = isPreview && !isApplying
  const canUndo = snapshot?.status === "applied" && !isApplying
  const snapshotErrorMessage =
    snapshot?.errorMessage &&
    !isStalePageEditResolveError(snapshot.errorMessage)
      ? snapshot.errorMessage
      : null
  const isStaleResolveFailure =
    snapshot?.status === "failed" &&
    snapshot.errorMessage != null &&
    isStalePageEditResolveError(snapshot.errorMessage)
  const title = toolError
    ? "Page update failed"
    : isStaleResolveFailure
      ? "Suggested page update"
      : snapshot?.status === "failed" && snapshotErrorMessage
        ? "Page update not applied"
        : isDeclined
        ? isBaselineCurrent
          ? "Page change discarded"
          : "Page change unavailable"
        : snapshot?.status === "undone"
          ? "Page change undone"
          : isPreview
            ? "Page update ready"
            : isApplying
              ? "Preparing page update"
              : "Page updated"

  return (
    <div className="not-prose mb-3 space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2">
        <FilePenLineIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-sm">{summary}</p>
          {isPreview ? (
            <p className="text-muted-foreground text-xs">
              Apply the update or use Show changes to preview it in the editor.
            </p>
          ) : null}
          {pageChangedSinceSuggestion ? (
            <p className="text-muted-foreground text-xs">
              The page has changed since this suggestion was created.
            </p>
          ) : null}
          {pageChangedSinceApplied ? (
            <p className="text-muted-foreground text-xs">
              The page has changed since this update was applied.
            </p>
          ) : null}
          {pageChangedSinceUndo ? (
            <p className="text-muted-foreground text-xs">
              The page has changed since this update was undone.
            </p>
          ) : null}
          {toolError ? (
            <p className="text-destructive text-sm">{toolError}</p>
          ) : null}
          {snapshot?.status === "failed" && snapshotErrorMessage ? (
            <p className="text-destructive text-sm">{snapshotErrorMessage}</p>
          ) : null}
          {isDeclined && isBaselineCurrent ? (
            <p className="text-muted-foreground text-xs">
              This suggested change was not applied.
            </p>
          ) : null}
          {isUndone && isReviewAvailable ? (
            <p className="text-muted-foreground text-xs">
              This change was undone. Apply it again or use Show changes to preview.
            </p>
          ) : null}
          {isUndone && !isReviewAvailable ? (
            <p className="text-muted-foreground text-xs">This change was undone.</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canReviewChanges ? (
          <Button
            disabled={isApplying}
            onClick={onToggleChanges}
            size="sm"
            type="button"
            variant="outline"
          >
            {isDiffVisible ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
            {isDiffVisible ? "Hide changes" : "Show changes"}
          </Button>
        ) : null}
        {canApply ? (
          <Button
            disabled={isApplyingEdit}
            onClick={() => {
              setIsApplyingEdit(true)
              void Promise.resolve(onApply()).finally(() => {
                setIsApplyingEdit(false)
              })
            }}
            size="sm"
            type="button"
          >
            {isApplyingEdit ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CheckIcon className="size-4" />
            )}
            Apply
          </Button>
        ) : null}
        {canDiscard ? (
          <Button
            disabled={isDiscarding}
            onClick={() => {
              setIsDiscarding(true)
              void Promise.resolve(onDiscard()).finally(() => {
                setIsDiscarding(false)
              })
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isDiscarding ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <XIcon className="size-4" />
            )}
            Discard
          </Button>
        ) : null}
        {canUndo ? (
          <Button
            disabled={isUndoing}
            onClick={() => {
              setIsUndoing(true)
              void Promise.resolve(onUndo()).finally(() => {
                setIsUndoing(false)
              })
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isUndoing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <Undo2Icon className="size-4" />
            )}
            Undo
          </Button>
        ) : null}
        {isApplying ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
            <Loader2Icon className="size-3.5 animate-spin" />
            Preparing update...
          </span>
        ) : null}
      </div>
    </div>
  )
}