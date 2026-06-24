export const API_BASE_URL = resolveApiBaseUrl()

declare global {
  interface Window {
    __NOTELAB_MOBILE_AUTH_COOKIE__?: string
  }
}

type ApiFetchOptions = RequestInit & {
  auth?: boolean
}

type ApiErrorBody = {
  code?: string
  error?: string | { message?: string }
  message?: string
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong. Please try again."
}

export async function apiFetch<T>(
  path: string,
  { auth = true, headers, body, ...init }: ApiFetchOptions = {},
) {
  const requestHeaders = getApiRequestHeaders(headers)

  if (body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json")
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    body,
    credentials: auth ? "include" : "same-origin",
    headers: requestHeaders,
  })

  const text = await response.text()
  const data = text ? parseJson(text) : null

  if (!response.ok) {
    throw new ApiError(readErrorMessage(data, response.status), response.status, data)
  }

  return data as T
}

export function getApiRequestHeaders(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers)
  const mobileViewerCookie = readEmbeddedMobileAuthCookie()

  if (mobileViewerCookie && !requestHeaders.has("x-mobile-auth-cookie")) {
    requestHeaders.set("x-mobile-auth-cookie", mobileViewerCookie)
  }

  return requestHeaders
}

export function authFetch<T>(path: string, body?: unknown, init?: RequestInit) {
  return apiFetch<T>(`/api/auth${path}`, {
    ...init,
    method: init?.method ?? "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function toApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path
  }

  return API_BASE_URL
    ? `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
    : path.startsWith("/")
      ? path
      : `/${path}`
}

function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "")

  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  if (
    typeof window !== "undefined" &&
    window.location.hostname === "app.notelab.io"
  ) {
    return "https://api.notelab.io"
  }

  return ""
}

function readEmbeddedMobileAuthCookie() {
  if (typeof window === "undefined") {
    return null
  }

  const cookie = window.__NOTELAB_MOBILE_AUTH_COOKIE__

  return typeof cookie === "string" && cookie.trim() ? cookie : null
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function readErrorMessage(body: unknown, status: number) {
  if (typeof body === "string" && body.trim()) {
    return body
  }

  if (body && typeof body === "object") {
    const errorBody = body as ApiErrorBody

    if (typeof errorBody.message === "string") {
      return errorBody.message
    }

    if (typeof errorBody.error === "string") {
      return errorBody.error
    }

    if (errorBody.error?.message) {
      return errorBody.error.message
    }
  }

  if (status === 401) {
    return "Please sign in to continue."
  }

  return "Something went wrong. Please try again."
}
