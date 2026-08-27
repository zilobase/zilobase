export function parseDatabaseDateValue(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return undefined
  }

  const localDateTimeMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  )

  if (localDateTimeMatch) {
    const year = Number(localDateTimeMatch[1])
    const month = Number(localDateTimeMatch[2])
    const day = Number(localDateTimeMatch[3])
    const hours = Number(localDateTimeMatch[4])
    const minutes = Number(localDateTimeMatch[5])
    const date = new Date(year, month - 1, day, hours, minutes)

    return isSameDateParts(date, year, month, day) &&
      date.getHours() === hours &&
      date.getMinutes() === minutes
      ? date
      : undefined
  }

  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const month = Number(dateOnlyMatch[2])
    const day = Number(dateOnlyMatch[3])
    const date = new Date(year, month - 1, day)

    return isSameDateParts(date, year, month, day) ? date : undefined
  }

  const date = new Date(trimmedValue)

  return Number.isNaN(date.getTime()) ? undefined : date
}

function isSameDateParts(date: Date, year: number, month: number, day: number) {
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}
