export function hasDragType(
  dataTransfer: DataTransfer | null,
  type: string,
) {
  return dataTransfer
    ? Array.prototype.includes.call(dataTransfer.types, type)
    : false
}

export function readDragPayload<T>(
  dataTransfer: DataTransfer | null,
  type: string,
  isPayload: (value: unknown) => value is T,
  fallback: T | null = null,
): T | null {
  try {
    const raw = dataTransfer?.getData(type)
    if (!raw) return fallback

    const value: unknown = JSON.parse(raw)
    return isPayload(value) ? value : null
  } catch {
    return null
  }
}

export function writeDragPayload(
  dataTransfer: DataTransfer,
  type: string,
  payload: unknown,
) {
  dataTransfer.setData(type, JSON.stringify(payload))
}
