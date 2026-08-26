const INTERACTIVE_DATABASE_CARD_SELECTOR = [
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[data-database-cell-input]",
].join(",")

export function isInteractiveDatabaseCardTarget(target: EventTarget | null) {
  if (!target || !("closest" in target)) return false

  const closest = (target as { closest?: unknown }).closest
  if (typeof closest !== "function") return false

  return Boolean(
    closest.call(target, INTERACTIVE_DATABASE_CARD_SELECTOR),
  )
}
