export const ACTIVE_ORGANIZATION_MISMATCH_CODE = "ACTIVE_ORGANIZATION_MISMATCH"

export class ActiveWorkspaceMismatchError extends Error {
  readonly code = ACTIVE_ORGANIZATION_MISMATCH_CODE
  readonly status = 409
  readonly workspaceId: string

  constructor(workspaceId: string, message?: string) {
    super(message ?? "Switch to the page workspace to continue.")
    this.name = "ActiveWorkspaceMismatchError"
    this.workspaceId = workspaceId
  }
}

export function isActiveWorkspaceMismatchError(
  error: unknown,
): error is ActiveWorkspaceMismatchError {
  return error instanceof ActiveWorkspaceMismatchError
}

export function parseActiveWorkspaceMismatchError(
  error: unknown,
): ActiveWorkspaceMismatchError | null {
  if (isActiveWorkspaceMismatchError(error)) {
    return error
  }

  if (
    typeof error !== "object" ||
    error === null ||
    !("status" in error) ||
    error.status !== 409
  ) {
    return null
  }

  const body = "body" in error ? error.body : null

  if (!body || typeof body !== "object") {
    return null
  }

  const record = body as {
    code?: unknown
    error?: unknown
    workspaceId?: unknown
  }

  if (
    record.code !== ACTIVE_ORGANIZATION_MISMATCH_CODE ||
    typeof record.workspaceId !== "string" ||
    record.workspaceId.length === 0
  ) {
    return null
  }

  const message =
    typeof record.error === "string"
      ? record.error
      : "Switch to the page workspace to continue."

  return new ActiveWorkspaceMismatchError(record.workspaceId, message)
}