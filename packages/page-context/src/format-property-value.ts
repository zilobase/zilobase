export type DatabasePropertyValue = string | string[]

export function parsePropertyValue(
  value: unknown,
  propertyType = "text",
): DatabasePropertyValue {
  if (typeof value === "string") {
    return value
  }

  if (
    typeof value === "number" &&
    (propertyType === "number" ||
      propertyType === "phone" ||
      propertyType === "text")
  ) {
    return Number.isFinite(value) ? String(value) : ""
  }

  if (typeof value === "boolean" && propertyType === "checkbox") {
    return value ? "true" : "false"
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") {
        return [item]
      }

      if (item && typeof item === "object" && "name" in item) {
        const name = (item as { name?: unknown }).name
        return typeof name === "string" && name.length > 0 ? [name] : []
      }

      return []
    })
  }

  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text

    if (typeof text === "string") {
      return text
    }

    if (Array.isArray(text)) {
      return text.filter((item): item is string => typeof item === "string")
    }
  }

  if (value && typeof value === "object" && propertyType === "date") {
    const record = value as { date?: unknown; end?: unknown; start?: unknown }

    if (typeof record.date === "string") {
      return record.date
    }

    if (typeof record.start === "string") {
      return typeof record.end === "string" && record.end
        ? [record.start, record.end]
        : record.start
    }
  }

  if (value && typeof value === "object" && "options" in value) {
    const options = (value as { options?: unknown }).options

    if (Array.isArray(options)) {
      return options.flatMap((item) => {
        if (typeof item === "string") {
          return [item]
        }

        if (item && typeof item === "object" && "name" in item) {
          const name = (item as { name?: unknown }).name
          return typeof name === "string" && name.length > 0 ? [name] : []
        }

        return []
      })
    }
  }

  return ""
}

export function formatPropertyValueForContext(
  value: unknown,
  propertyType: string,
) {
  const parsed = parsePropertyValue(value, propertyType)

  if (Array.isArray(parsed)) {
    return parsed.join(", ")
  }

  if (propertyType === "checkbox") {
    return parsed === "true" ? "Yes" : parsed === "false" ? "No" : ""
  }

  return parsed.trim()
}