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

  let completed = await apiFetch<{
    file: AiFileRecord
    job?: { error: string | null; id: string; status: string }
  }>(
    `/api/ai/files/${encodeURIComponent(reservation.id)}/complete`,
    {
      headers: { "x-zilobase-workspace-id": input.workspaceId },
      method: "POST",
    },
  )
  if (completed.job) {
    await waitForAiJob(completed.job.id, input.workspaceId)
    completed = await apiFetch<{ file: AiFileRecord }>(
      `/api/ai/files/${encodeURIComponent(reservation.id)}/complete`,
      {
        headers: { "x-zilobase-workspace-id": input.workspaceId },
        method: "POST",
      },
    )
  }
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

async function waitForAiJob(jobId: string, workspaceId: string) {
  const deadline = Date.now() + 5 * 60 * 1_000
  while (Date.now() < deadline) {
    const { job } = await apiFetch<{
      job: { error: string | null; status: string }
    }>(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
      headers: { "x-zilobase-workspace-id": workspaceId },
    })
    if (job.status === "succeeded") return
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || "File processing failed.")
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error("File processing timed out. Try the upload again.")
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
