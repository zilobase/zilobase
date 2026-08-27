import type { FileUIPart } from "ai"

import { apiFetch, getApiRequestHeaders, toApiUrl } from "@/lib/api"
import { desktopNetworkFetch } from "@/lib/desktop-network"

export const MAX_AI_FILE_BYTES = 20 * 1024 * 1024
export const MAX_AI_FILES = 5
export const AI_FILE_ACCEPT = [
  ".csv",
  ".docx",
  ".json",
  ".md",
  ".pdf",
  ".pptx",
  ".txt",
  ".xlsx",
  ".zip",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",")

type AiUploadTarget = {
  expiresAt: string
  headers: Record<string, string>
  method: "PUT"
  storageMode: "s3" | "binding"
  url: string
}

type AiFileRecord = {
  byteSize: number
  contentType: string
  downloadUrl?: string
  expiresAt: string
  filename: string
  id: string
  status?: string
}

export type UploadedAiFile = AiFileRecord & {
  part: FileUIPart
}

export async function uploadAiChatFile(input: {
  part: FileUIPart
  threadId: string
  workspaceId: string
}): Promise<UploadedAiFile> {
  const file = await toFile(input.part)
  if (file.size > MAX_AI_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 20 MB file limit.`)
  }

  const { file: reservation, upload } = await apiFetch<{
    file: AiFileRecord
    upload: AiUploadTarget
  }>("/api/ai/files/uploads", {
    body: JSON.stringify({
      byteSize: file.size,
      contentType: file.type || "application/octet-stream",
      filename: file.name,
      threadId: input.threadId,
    }),
    headers: { "x-zilobase-workspace-id": input.workspaceId },
    method: "POST",
  })

  const headers = upload.storageMode === "binding"
    ? getApiRequestHeaders({
        ...upload.headers,
        "x-zilobase-workspace-id": input.workspaceId,
      })
    : new Headers(upload.headers)
  const response = await desktopNetworkFetch(resolveUploadUrl(upload), {
    body: file,
    credentials: upload.storageMode === "binding" ? "include" : "omit",
    headers,
    method: upload.method,
  })
  if (!response.ok) {
    throw new Error(`${file.name} upload failed (${response.status}).`)
  }

  const completed = await apiFetch<{ file: AiFileRecord }>(
    `/api/ai/files/${encodeURIComponent(reservation.id)}/complete`,
    {
      headers: { "x-zilobase-workspace-id": input.workspaceId },
      method: "POST",
    },
  )
  const downloadUrl = completed.file.downloadUrl
  if (!downloadUrl) throw new Error(`${file.name} did not produce a download reference.`)

  return {
    ...completed.file,
    part: {
      filename: completed.file.filename,
      mediaType: completed.file.contentType,
      type: "file",
      url: downloadUrl,
    },
  }
}

async function toFile(part: FileUIPart) {
  if (!part.url) throw new Error("Attached file data is missing.")
  const response = await fetch(part.url)
  if (!response.ok) throw new Error(`Could not read ${part.filename ?? "attachment"}.`)
  const blob = await response.blob()
  return new File([blob], part.filename ?? "attachment", {
    type: part.mediaType || blob.type || "application/octet-stream",
  })
}

function resolveUploadUrl(upload: AiUploadTarget) {
  return upload.storageMode === "s3" ? upload.url : toApiUrl(upload.url)
}
