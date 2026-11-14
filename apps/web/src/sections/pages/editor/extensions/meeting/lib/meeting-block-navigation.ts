export function findMeetingBlock(root: ParentNode, meetingId: string) {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-meeting-id]")).find(
      (element) => element.dataset.meetingId === meetingId,
    ) ?? null
  );
}

/** Scrolls to a block by its stable ID and briefly highlights it. */
export function scrollToBlock(root: ParentNode, blockId: string) {
  const block = Array.from(root.querySelectorAll<HTMLElement>("[data-blockid]")).find(
    (element) => element.dataset.blockid === blockId,
  );
  if (!block) return false;
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  block.classList.add("editor-block-focus");
  window.setTimeout(() => block.classList.remove("editor-block-focus"), 2_000);
  return true;
}

export function scrollToMeetingBlock(root: ParentNode, meetingId: string) {
  const block = findMeetingBlock(root, meetingId);
  if (!block) return false;

  block.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}
