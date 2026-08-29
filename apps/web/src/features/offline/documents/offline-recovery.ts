import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import * as Y from "yjs"

import { apiFetch } from "@/features/desktop/network/api"
import {
  applyTicketState,
  connectLocalPageDocument,
  flushLocalPageDocument,
  openLocalPageDocument,
  recordConfirmedDocument,
  waitForProviderSync,
  type CollaborationTicket,
} from "./offline-documents"
import {
  OFFLINE_SCHEMA_VERSION,
  getConnectivityState,
  getOfflineManifest,
  patchOfflineItem,
} from "../model/offline-store"

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_PAGE_BYTES = 25 * 1024 * 1024
const MAX_MANIFEST_BYTES = 1024 * 1024

type RecoveryPage = {
  checksum: string
  exportedAt: string
  file: string
  name: string
  pageId: string
  workspaceId: string
}

type RecoveryManifest = {
  accountId: string
  apiOrigin: string
  exportedAt: string
  pages: RecoveryPage[]
  schemaVersion: number
}

export async function createRecoveryArchive() {
  const current = getOfflineManifest()
  if (!current.accountId) throw new Error("No offline account is available.")
  const pages = current.items.filter(
    (item) => item.kind === "page" && (item.dirty || item.blocked),
  )
  if (!pages.length) throw new Error("There are no unsynced drafts to export.")

  const files: Record<string, Uint8Array> = {}
  const records: RecoveryPage[] = []
  for (const page of pages) {
    const local = await openLocalPageDocument(page.workspaceId, page.id)
    try {
      const update = Y.encodeStateAsUpdate(local.document)
      const file = `pages/${safePageId(page.id)}.yjs`
      files[file] = update
      records.push({
        checksum: await sha256(update),
        exportedAt: new Date().toISOString(),
        file,
        name: page.name,
        pageId: page.id,
        workspaceId: page.workspaceId,
      })
    } finally {
      local.persistence.destroy()
      local.document.destroy()
    }
  }
  const recovery: RecoveryManifest = {
    accountId: current.accountId,
    apiOrigin: current.apiOrigin,
    exportedAt: new Date().toISOString(),
    pages: records,
    schemaVersion: OFFLINE_SCHEMA_VERSION,
  }
  files["manifest.json"] = strToU8(JSON.stringify(recovery, null, 2))
  return zipSync(files, { level: 6 })
}

export async function downloadRecoveryArchive() {
  const archive = await createRecoveryArchive()
  const date = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(new Blob([archive], { type: "application/zip" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `zilobase-recovery-${date}.zip`
  link.click()
  URL.revokeObjectURL(url)
}

export async function importRecoveryArchive(file: File) {
  if (getConnectivityState() !== "online") {
    throw new Error("Reconnect before importing a recovery file.")
  }
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("Recovery archive is too large.")
  const files = extractRecoveryArchive(new Uint8Array(await file.arrayBuffer()))
  if (!files["manifest.json"]) throw new Error("Recovery manifest is missing.")
  const recovery = validateRecoveryManifest(JSON.parse(strFromU8(files["manifest.json"])))
  const current = getOfflineManifest()
  if (recovery.accountId !== current.accountId || recovery.apiOrigin !== current.apiOrigin) {
    throw new Error("This recovery file belongs to a different account or server.")
  }

  const results: Array<{ pageId: string; success: boolean; message: string }> = []
  for (const page of recovery.pages) {
    const bytes = files[page.file]
    try {
      if (!bytes || bytes.byteLength > MAX_PAGE_BYTES) throw new Error("Page update is missing or too large.")
      if ((await sha256(bytes)) !== page.checksum) throw new Error("Checksum does not match.")
      const ticket = await apiFetch<CollaborationTicket>(
        `/pages/${encodeURIComponent(page.pageId)}/collaboration-ticket`,
        { method: "POST" },
      )
      const local = await openLocalPageDocument(page.workspaceId, page.pageId)
      try {
        applyTicketState(local.document, ticket)
        Y.applyUpdate(local.document, bytes)
        await patchOfflineItem("page", page.pageId, { blocked: false, dirty: true })
        const provider = connectLocalPageDocument({
          document: local.document,
          pageId: page.pageId,
          ticket,
        })
        try {
          await waitForProviderSync(provider, 30_000)
          await flushLocalPageDocument(local)
          await recordConfirmedDocument(page.pageId, local.document)
        } finally {
          provider.destroy()
        }
      } finally {
        local.persistence.destroy()
        local.document.destroy()
      }
      results.push({ pageId: page.pageId, success: true, message: "Synced" })
    } catch (error) {
      results.push({
        pageId: page.pageId,
        success: false,
        message: error instanceof Error ? error.message : "Import failed",
      })
    }
  }
  return results
}

export function extractRecoveryArchive(archive: Uint8Array) {
  let extractedBytes = 0
  let invalidEntry = false
  const entryNames = new Set<string>()
  const files = unzipSync(archive, {
    filter: (entry) => {
      const allowedPath =
        entry.name === "manifest.json" ||
        /^pages\/[A-Za-z0-9_-]+\.yjs$/.test(entry.name)
      const allowedSize =
        entry.name === "manifest.json"
          ? entry.originalSize <= MAX_MANIFEST_BYTES
          : entry.originalSize <= MAX_PAGE_BYTES
      extractedBytes += entry.originalSize
      const duplicate = entryNames.has(entry.name)
      entryNames.add(entry.name)
      if (
        !allowedPath ||
        !allowedSize ||
        duplicate ||
        extractedBytes > MAX_ARCHIVE_BYTES
      ) {
        invalidEntry = true
        return false
      }
      return true
    },
  })
  if (invalidEntry) throw new Error("Recovery archive contains an unsafe path or oversized file.")
  return files
}

export async function syncDirtyOfflinePages() {
  if (getConnectivityState() !== "online") throw new Error("Reconnect before syncing drafts.")
  const pages = getOfflineManifest().items.filter(
    (item) => item.kind === "page" && (item.dirty || item.blocked),
  )
  const results: Array<{ pageId: string; success: boolean; message: string }> = []
  let cursor = 0
  const worker = async () => {
    while (cursor < pages.length) {
      const page = pages[cursor++]
      if (!page) return
      try {
        const ticket = await apiFetch<CollaborationTicket>(
          `/pages/${encodeURIComponent(page.id)}/collaboration-ticket`,
          { method: "POST" },
        )
        const local = await openLocalPageDocument(page.workspaceId, page.id)
        try {
          applyTicketState(local.document, ticket)
          const provider = connectLocalPageDocument({ document: local.document, pageId: page.id, ticket })
          try {
            await waitForProviderSync(provider, 30_000)
            await flushLocalPageDocument(local)
            await recordConfirmedDocument(page.id, local.document)
          } finally {
            provider.destroy()
          }
        } finally {
          local.persistence.destroy()
          local.document.destroy()
        }
        results.push({ pageId: page.id, success: true, message: "Synced" })
      } catch (error) {
        results.push({
          pageId: page.id,
          success: false,
          message: error instanceof Error ? error.message : "Sync failed",
        })
      }
    }
  }
  await Promise.all([worker(), worker()])
  return results
}

export function validateRecoveryManifest(value: unknown): RecoveryManifest {
  if (!value || typeof value !== "object") throw new Error("Recovery manifest is invalid.")
  const candidate = value as Partial<RecoveryManifest>
  if (
    candidate.schemaVersion !== OFFLINE_SCHEMA_VERSION ||
    typeof candidate.accountId !== "string" ||
    typeof candidate.apiOrigin !== "string" ||
    typeof candidate.exportedAt !== "string" ||
    !Array.isArray(candidate.pages)
  ) throw new Error("Recovery manifest version or shape is invalid.")

  const ids = new Set<string>()
  for (const page of candidate.pages) {
    if (
      !page ||
      typeof page.pageId !== "string" ||
      typeof page.workspaceId !== "string" ||
      typeof page.name !== "string" ||
      typeof page.file !== "string" ||
      !/^pages\/[A-Za-z0-9_-]+\.yjs$/.test(page.file) ||
      typeof page.checksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(page.checksum)
    ) throw new Error("Recovery page entry is invalid.")
    if (ids.has(page.pageId)) throw new Error("Recovery file contains duplicate page IDs.")
    ids.add(page.pageId)
  }
  return candidate as RecoveryManifest
}

function safePageId(pageId: string) {
  return pageId.replace(/[^A-Za-z0-9_-]/g, "_")
}

async function sha256(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", value as BufferSource)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
