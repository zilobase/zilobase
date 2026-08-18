export function findMeetingBlock(root: ParentNode, meetingId: string) {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-meeting-id]")).find(
      (element) => element.dataset.meetingId === meetingId,
    ) ?? null
  )
}

export function scrollToMeetingBlock(root: ParentNode, meetingId: string) {
  const block = findMeetingBlock(root, meetingId)
  if (!block) return false

  block.scrollIntoView({ behavior: "smooth", block: "center" })
  return true
}
