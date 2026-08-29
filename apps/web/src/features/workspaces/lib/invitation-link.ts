export function readSingleInvitationId(search: string) {
  const values = new URLSearchParams(search).getAll("id")
  const value = values[0]?.trim()
  return values.length === 1 && value ? value : null
}
