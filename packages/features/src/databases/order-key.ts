export const DATABASE_ORDER_KEY_SCALE = 10
export const DATABASE_ORDER_KEY_FACTOR = 10n ** BigInt(DATABASE_ORDER_KEY_SCALE)
export const DATABASE_ORDER_KEY_SPACING = 1024n * DATABASE_ORDER_KEY_FACTOR
const DATABASE_ORDER_KEY_MAX_SCALED = 10n ** 30n - 1n

const ORDER_KEY_PATTERN = /^(-?)(0|[1-9]\d{0,19})(?:\.(\d{1,10}))?$/

export function parseDatabaseOrderKey(value: string): bigint {
  const match = ORDER_KEY_PATTERN.exec(value)

  if (!match) throw new Error("Invalid database order key")

  const sign = match[1] === "-" ? -1n : 1n
  const integer = BigInt(match[2] ?? "0") * DATABASE_ORDER_KEY_FACTOR
  const fraction = BigInt((match[3] ?? "").padEnd(DATABASE_ORDER_KEY_SCALE, "0"))
  if (sign < 0n && integer === 0n && fraction === 0n) {
    throw new Error("Invalid database order key")
  }

  return sign * (integer + fraction)
}

export function formatDatabaseOrderKey(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  if (absolute > DATABASE_ORDER_KEY_MAX_SCALED) {
    throw new Error("Database order key is outside NUMERIC(30,10)")
  }
  const integer = absolute / DATABASE_ORDER_KEY_FACTOR
  const fraction = (absolute % DATABASE_ORDER_KEY_FACTOR)
    .toString()
    .padStart(DATABASE_ORDER_KEY_SCALE, "0")
    .replace(/0+$/, "")

  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`
}

export function databaseOrderKeyAtPosition(position: number): string {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error("Database order position must be a non-negative safe integer")
  }

  return formatDatabaseOrderKey(
    BigInt(position + 1) * DATABASE_ORDER_KEY_SPACING,
  )
}

export function databaseOrderKeyBetween(
  previous: string | null,
  next: string | null,
): string | null {
  if (previous === null && next === null) {
    return formatDatabaseOrderKey(DATABASE_ORDER_KEY_SPACING)
  }

  if (previous === null) {
    const candidate = parseDatabaseOrderKey(next!) - DATABASE_ORDER_KEY_SPACING
    return candidate < -DATABASE_ORDER_KEY_MAX_SCALED
      ? null
      : formatDatabaseOrderKey(candidate)
  }

  if (next === null) {
    const candidate = parseDatabaseOrderKey(previous) + DATABASE_ORDER_KEY_SPACING
    return candidate > DATABASE_ORDER_KEY_MAX_SCALED
      ? null
      : formatDatabaseOrderKey(candidate)
  }

  const lower = parseDatabaseOrderKey(previous)
  const upper = parseDatabaseOrderKey(next)

  if (lower >= upper || upper - lower <= 1n) return null

  return formatDatabaseOrderKey(lower + (upper - lower) / 2n)
}
