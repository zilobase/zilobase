import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CheckIcon, DownloadIcon, LoaderCircleIcon } from "@/shared/components/icons"
import { toast } from "sonner"

import { DropDrawerItem } from "@/shared/ui/dropdrawer"
import { apiFetch } from "@/features/desktop/network/api"
import {
  applyTicketState,
  connectLocalPageDocument,
  flushLocalPageDocument,
  openLocalPageDocument,
  waitForProviderSync,
  type CollaborationTicket,
} from "../documents/offline-documents"
import {
  bytesToBase64,
  clearOfflineDocumentDatabase,
  getConnectivityState,
  getOfflineItem,
  getOfflineManifest,
  isDesktopOfflineSupported,
  removeOfflineItem,
  setOfflineItem,
} from "../model/offline-store"
import { useOfflineManifest } from "../providers/offline-provider"
import * as Y from "yjs"

type Props = {
  databaseId?: string | null
  name: string
  pageId?: string | null
  workspaceId: string | null
}

export function OfflineAvailabilityAction(props: Props) {
  const queryClient = useQueryClient()
  const manifest = useOfflineManifest()
  const [pending, setPending] = React.useState(false)
  const kind = props.databaseId ? "database" : "page"
  const id = props.databaseId ?? props.pageId
  const item = id
    ? manifest.items.find((entry) => entry.kind === kind && entry.id === id)
    : undefined

  if (!isDesktopOfflineSupported() || !id) return null

  const run = async () => {
    if (!props.workspaceId) {
      toast.error("Select a workspace first.")
      return
    }
    if (item?.dirty || item?.blocked) {
      toast.error("Export or sync this local draft before removing it.")
      return
    }

    setPending(true)
    try {
      if (item) {
        await removeAvailableItem({
          id,
          kind,
          pageId: props.pageId,
          queryClient,
          workspaceId: props.workspaceId,
        })
        toast.success("Offline copy removed.")
      } else if (kind === "page") {
        await downloadPage({
          name: props.name,
          pageId: id,
          queryClient,
          workspaceId: props.workspaceId,
        })
        toast.success("Page is available offline.")
      } else {
        await downloadDatabase({
          databaseId: id,
          name: props.name,
          queryClient,
          workspaceId: props.workspaceId,
        })
        toast.success("Database is available offline (read-only).")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Offline download failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <DropDrawerItem
      disabled={pending}
      onSelect={(event) => {
        event.preventDefault()
        void run()
      }}
    >
      {pending ? (
        <LoaderCircleIcon className="animate-spin text-muted-foreground" />
      ) : item ? (
        <CheckIcon className="text-muted-foreground" />
      ) : (
        <DownloadIcon className="text-muted-foreground" />
      )}
      <span>
        {pending
          ? "Downloading…"
          : item
            ? "Remove offline availability"
            : "Available offline"}
      </span>
    </DropDrawerItem>
  )
}

async function requireDownloadReady(workspaceId: string) {
  if (getConnectivityState() !== "online") {
    throw new Error("Connect to Zilobase before downloading this item.")
  }
  const manifest = getOfflineManifest()
  if (!manifest.workspaces.some((workspace) => workspace.id === workspaceId)) {
    throw new Error("Enable offline access for this workspace in Profile settings first.")
  }
  if (!manifest.accountId || !manifest.session) {
    throw new Error("Sign in again before downloading offline content.")
  }
}

async function downloadPage(input: {
  name: string
  pageId: string
  queryClient: ReturnType<typeof useQueryClient>
  workspaceId: string
}) {
  await requireDownloadReady(input.workspaceId)
  let local: Awaited<ReturnType<typeof openLocalPageDocument>> | null = null
  try {
    const pageDetail = await apiFetch<unknown>(`/pages/${encodeURIComponent(input.pageId)}`)
    const properties = await apiFetch<unknown>(
      `/pages/${encodeURIComponent(input.pageId)}/properties`,
    )
    const layout = await apiFetch<unknown>(
      `/page-layouts/resolve?pageId=${encodeURIComponent(input.pageId)}`,
    )
    const ticket = await apiFetch<CollaborationTicket>(
      `/pages/${encodeURIComponent(input.pageId)}/collaboration-ticket`,
      { method: "POST" },
    )

    local = await openLocalPageDocument(input.workspaceId, input.pageId)
    applyTicketState(local.document, ticket)
    const provider = connectLocalPageDocument({
      document: local.document,
      pageId: input.pageId,
      ticket,
    })
    await waitForProviderSync(provider)
    await flushLocalPageDocument(local)
    const now = new Date().toISOString()
    await setOfflineItem({
      availableAt: now,
      confirmedStateVector: bytesToBase64(Y.encodeStateVector(local.document)),
      dirty: false,
      id: input.pageId,
      kind: "page",
      lastSyncedAt: now,
      name: input.name,
      workspaceId: input.workspaceId,
    })
    input.queryClient.setQueryData(["page", input.pageId], pageDetail)
    input.queryClient.setQueryData(["page", input.pageId, "properties"], properties)
    input.queryClient.setQueryData(
      ["page-layouts", "resolved", input.pageId, "none"],
      layout,
    )
    provider.destroy()
  } catch (error) {
    local?.persistence.destroy()
    local?.document.destroy()
    await clearOfflineDocumentDatabase(input.workspaceId, input.pageId)
    throw error
  }
  local.persistence.destroy()
  local.document.destroy()
}

async function downloadDatabase(input: {
  databaseId: string
  name: string
  queryClient: ReturnType<typeof useQueryClient>
  workspaceId: string
}) {
  await requireDownloadReady(input.workspaceId)
  const payload = await apiFetch<{ database: { pageId?: string | null } }>(
    `/databases/${encodeURIComponent(input.databaseId)}?includeDeleted=1`,
  )
  const pageId = payload.database.pageId ?? null
  const pageDetail = pageId
    ? await apiFetch<unknown>(`/pages/${encodeURIComponent(pageId)}`)
    : null
  await setOfflineItem({
    availableAt: new Date().toISOString(),
    id: input.databaseId,
    kind: "database",
    name: input.name,
    pageId,
    workspaceId: input.workspaceId,
  })
  input.queryClient.setQueryData(
    ["database", input.databaseId, "full", "include-deleted"],
    payload,
  )
  if (pageId) input.queryClient.setQueryData(["page", pageId], pageDetail)
}

async function removeAvailableItem(input: {
  id: string
  kind: "page" | "database"
  pageId?: string | null
  queryClient: ReturnType<typeof useQueryClient>
  workspaceId: string
}) {
  const current = getOfflineItem(input.kind, input.id)
  if (current?.dirty || current?.blocked) {
    throw new Error("This page has an unsynced local draft.")
  }
  if (input.kind === "page") {
    await clearOfflineDocumentDatabase(input.workspaceId, input.id)
    input.queryClient.removeQueries({ queryKey: ["page", input.id] })
  } else {
    input.queryClient.removeQueries({ queryKey: ["database", input.id] })
    if (input.pageId) {
      input.queryClient.removeQueries({ queryKey: ["page", input.pageId] })
    }
  }
  await removeOfflineItem(input.kind, input.id)
}
