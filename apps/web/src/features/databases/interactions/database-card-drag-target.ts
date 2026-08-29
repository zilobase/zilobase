const INTERACTIVE_DATABASE_CARD_SELECTOR = [
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[data-database-cell-input]",
].join(",")

const DATABASE_CARD_SELECTOR = [
  ".database-gallery-card",
  ".database-kanban-card",
].join(",")

export function isInteractiveDatabaseCardTarget(target: EventTarget | null) {
  if (!target || !("closest" in target)) return false

  const closest = (target as { closest?: unknown }).closest
  if (typeof closest !== "function") return false

  const interactiveTarget = closest.call(
    target,
    INTERACTIVE_DATABASE_CARD_SELECTOR,
  )
  if (!interactiveTarget) return false

  const card = closest.call(target, DATABASE_CARD_SELECTOR)
  if (!card || !("contains" in card) || typeof card.contains !== "function") {
    return true
  }

  return card.contains(interactiveTarget)
}
