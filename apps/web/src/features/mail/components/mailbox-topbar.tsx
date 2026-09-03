import type { ComponentType, ReactNode } from "react"
import type { MailModifyRequest } from "@zilobase/features/mail"

import {
  ArchiveIcon,
  MailIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

import { MailActionButton } from "./mail-actions"

type MailIndexProgress = {
  indexedThreadCount: number
  resultSizeEstimate?: number | null
  status: string
}

export function MailboxTopbar({
  activeViewIcon: ActiveViewIcon,
  activeViewLabel,
  batchCount,
  filterToolbar,
  indexProgress,
  labelMenu,
  mutating,
  onBatchModify,
  onClearBatch,
  onCompose,
  onQueryChange,
  onRefresh,
  online,
  query,
  syncing,
  viewSettings,
}: {
  activeViewIcon: ComponentType<{ className?: string }>
  activeViewLabel: string
  batchCount: number
  filterToolbar?: ReactNode
  indexProgress?: MailIndexProgress
  labelMenu: ReactNode
  mutating: boolean
  onBatchModify: (modification: MailModifyRequest) => Promise<void>
  onClearBatch: () => void
  onCompose: () => void
  onQueryChange: (query: string) => void
  onRefresh: () => void
  online: boolean
  query: string
  syncing: boolean
  viewSettings: ReactNode
}) {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3 max-sm:flex-wrap">
        <div className="flex shrink-0 items-center gap-2">
          <ActiveViewIcon className="size-5 shrink-0 text-action-link" />
          <h1 className="text-xl font-semibold leading-7 tracking-normal text-content-primary">{activeViewLabel}</h1>
          {!online ? <WifiOffIcon className="size-4 text-content-secondary" aria-label="Offline" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 max-sm:basis-full">
          <Button disabled={!online} onClick={onCompose} size="sm" type="button">Compose</Button>
          <div className="relative min-w-0 flex-1 sm:max-w-72">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-content-secondary" />
            <Input
              aria-label="Search mail"
              className="h-8 bg-transparent pl-8"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={online ? "Search Gmail" : "Search downloaded mail"}
              value={query}
            />
          </div>
          <Button
            aria-label="Refresh mail"
            disabled={!online || syncing}
            onClick={onRefresh}
            size="icon-lg"
            title="Refresh mail"
            type="button"
            variant="ghost"
          >
            <RefreshCwIcon className={syncing ? "animate-spin" : undefined} />
          </Button>
          {labelMenu}
          {viewSettings}
        </div>
      </div>

      {filterToolbar}

      {indexProgress && indexProgress.status !== "ready" ? (
        <div aria-live="polite" className="mt-3 rounded-md border border-stroke-default bg-surface-raised px-3 py-2 text-xs text-content-secondary" role="status">
          {indexProgress.status === "error"
            ? "Mail indexing paused. It will retry automatically."
            : `Indexing full mailbox… ${indexProgress.indexedThreadCount}${indexProgress.resultSizeEstimate ? ` of about ${indexProgress.resultSizeEstimate}` : ""} threads`}
        </div>
      ) : null}

      {batchCount ? (
        <div className="mt-3 flex items-center gap-1 rounded-md border border-stroke-default bg-surface-raised px-2 py-1">
          <span className="mr-2 text-xs font-medium text-content-secondary">{batchCount} selected</span>
          <MailActionButton disabled={!online || mutating} icon={<MailIcon />} label="Mark selected read" onClick={() => onBatchModify({ removeLabelIds: ["UNREAD"] })} />
          <MailActionButton disabled={!online || mutating} icon={<StarIcon />} label="Star selected" onClick={() => onBatchModify({ addLabelIds: ["STARRED"] })} />
          <MailActionButton disabled={!online || mutating} icon={<ArchiveIcon />} label="Archive selected" onClick={() => onBatchModify({ removeLabelIds: ["INBOX"] })} />
          <MailActionButton disabled={!online || mutating} icon={<TriangleAlertIcon />} label="Move selected to spam" onClick={() => onBatchModify({ addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] })} />
          <Button className="ml-auto" onClick={onClearBatch} size="sm" type="button" variant="ghost">Clear</Button>
        </div>
      ) : null}
    </>
  )
}
