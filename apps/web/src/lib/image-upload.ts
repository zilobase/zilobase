import {
  apiFetch,
  getApiRequestHeaders,
  toApiUrl,
} from "@/lib/api"
import { desktopNetworkFetch } from "@/lib/desktop-network"

type ImageAsset = {
  byteSize: number
  contentType: string
  filename: string
  id: string
  status: string
}

type ImageUploadTarget = {
  expiresAt: string
  headers: Record<string, string>
  method: "PUT"
  storageMode: "s3" | "binding"
  url: string
}

type CreateImageUploadResponse = {
  asset: ImageAsset
  upload: ImageUploadTarget
}

type CompleteImageUploadResponse = {
  asset: ImageAsset
}

type ProfileImage = {
  byteSize: number
  contentType: string
  filename: string
  id: string
}

type CreateProfileImageUploadResponse = {
  image: ProfileImage
  upload: ImageUploadTarget
}

export type UploadPageImageInput = {
  databaseId?: string | null
  file: File
  workspaceId: string
  pageId: string
}

export type UploadedPageImage = {
  asset: ImageAsset
  url: string
}

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
const PROFILE_IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export async function uploadProfileImage(file: File) {
  validateProfileImage(file)

  const { image, upload } = await apiFetch<CreateProfileImageUploadResponse>(
    "/user-settings/profile/image/uploads",
    {
      body: JSON.stringify({
        byteSize: file.size,
        contentType: file.type,
        filename: file.name,
      }),
      method: "POST",
    },
  )

  await putImageBody(upload, file)

  return apiFetch<{ image: string }>(
    `/user-settings/profile/image/uploads/${encodeURIComponent(image.id)}/complete`,
    {
      body: JSON.stringify({
        byteSize: image.byteSize,
        contentType: image.contentType,
        filename: image.filename,
      }),
      method: "POST",
    },
  )
}

export function removeProfileImage() {
  return apiFetch<{ image: null }>("/user-settings/profile/image", {
    method: "DELETE",
  })
}

export function getUserImageUrl(image: string | null | undefined) {
  if (!image) {
    return undefined
  }

  return /^(?:https?:|blob:|data:)/.test(image) ? image : toApiUrl(image)
}

export async function uploadPageImage({
  databaseId,
  file,
  workspaceId,
  pageId,
}: UploadPageImageInput): Promise<UploadedPageImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are supported.")
  }

  const { asset, upload } = await apiFetch<CreateImageUploadResponse>(
    "/images/uploads",
    {
      body: JSON.stringify({
        byteSize: file.size,
        contentType: file.type,
        databaseId: databaseId || undefined,
        filename: file.name,
        workspaceId,
        pageId,
      }),
      method: "POST",
    },
  )

  await putImageBody(upload, file)

  const completed = await apiFetch<CompleteImageUploadResponse>(
    `/images/uploads/${encodeURIComponent(asset.id)}/complete`,
    {
      method: "POST",
    },
  )

  return {
    asset: completed.asset,
    url: toApiUrl(`/images/${encodeURIComponent(completed.asset.id)}`),
  }
}

async function putImageBody(upload: ImageUploadTarget, file: File) {
  const headers =
    upload.storageMode === "binding"
      ? getApiRequestHeaders(upload.headers)
      : new Headers(upload.headers)
  const response = await desktopNetworkFetch(getUploadUrl(upload), {
    body: file,
    credentials: upload.storageMode === "binding" ? "include" : "omit",
    headers,
    method: upload.method,
  })

  if (!response.ok) {
    throw new Error(`Image upload failed with status ${response.status}.`)
  }
}

function validateProfileImage(file: File) {
  if (!PROFILE_IMAGE_CONTENT_TYPES.has(file.type)) {
    throw new Error("Choose a JPG, PNG, GIF, WebP or AVIF image.")
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error("Profile pictures must be 5 MB or smaller.")
  }
}

function getUploadUrl(upload: ImageUploadTarget) {
  if (upload.storageMode === "s3") {
    return upload.url
  }

  try {
    const url = new URL(upload.url)

    return toApiUrl(`${url.pathname}${url.search}`)
  } catch {
    return toApiUrl(upload.url)
  }
}
