import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getApiErrorMessage } from "@/lib/api"
import { PageIcon } from "@/lib/page-icon"
import { useNotelabFeatures } from "@notelab/features"
import {
  useUpdatePage,
  pageQueryKey,
  type NotelabAiMode,
  type NotelabAiPageSummary,
  type Page,
  type PageMetadata,
} from "@notelab/features/pages"

const modeLabels: Record<NotelabAiMode, string> = {
  instruction: "instruction",
  skill: "skill",
}

export function NotelabAiItem({
  isFirst,
  isLast,
  mode,
  page,
  pageRecord,
}: {
  isFirst: boolean
  isLast: boolean
  mode: NotelabAiMode
  page: NotelabAiPageSummary
  pageRecord?: Page
}) {
  const navigate = useNavigate()
  const { apiFetch, queryClient } = useNotelabFeatures()
  const updatePage = useUpdatePage()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const isRemoving = updatePage.isPending

  const openPage = () => {
    void navigate({
      params: { pageId: page.id },
      to: "/page/$pageId",
    })
  }

  const remove = async () => {
    let metadata: PageMetadata = {}

    const cached = queryClient.getQueryData<Page | null>(
      pageQueryKey(page.id),
    )

    if (cached?.metadata) {
      metadata = cached.metadata
    } else {
      const result = await apiFetch<{ page: Page }>(
        `/pages/${page.id}`,
        { method: "GET" },
      )
      metadata = result.page.metadata ?? {}
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...metadata,
          notelabai: null,
        },
      },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          toast.success(`Removed as ${modeLabels[mode]}.`)
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error))
        },
      },
    )
  }

  return (
    <>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isFirst && "rounded-t-none",
          isLast && "rounded-b-none",
        )}
        onClick={openPage}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            openPage()
          }
        }}
        role="link"
        tabIndex={0}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <PageIcon
            page={
              pageRecord ?? {
                content: undefined,
                metadata: page.metadata,
              }
            }
          />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {page.name || "Untitled"}
        </span>
        <Button
          aria-label={`Remove as ${modeLabels[mode]}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          disabled={isRemoving}
          onClick={(event) => {
            event.stopPropagation()
            setConfirmOpen(true)
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {isRemoving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <XIcon />
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {modeLabels[mode]}</AlertDialogTitle>
            <AlertDialogDescription>
              Remove as {modeLabels[mode]}? This page will become a normal
              page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} variant="destructive">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function NotelabAiItemList({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="divide-y divide-border">{children}</div>
  )
}