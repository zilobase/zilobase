export function canEditOnlineDatabase(input: {
  connectivity: string
  offlineSessionLocked: boolean
  pageEditable: boolean
}) {
  return (
    input.pageEditable &&
    input.connectivity === "online" &&
    !input.offlineSessionLocked
  )
}
