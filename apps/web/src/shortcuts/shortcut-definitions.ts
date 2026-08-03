export const appShortcutDefinitions = {
  openSearch: {
    key: "k",
    primaryModifier: true,
  },
  undo: {
    key: "z",
    primaryModifier: true,
  },
} as const

export type AppShortcutId = keyof typeof appShortcutDefinitions

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>

export function matchesAppShortcut(
  event: ShortcutKeyboardEvent,
  shortcutId: AppShortcutId
) {
  const shortcut = appShortcutDefinitions[shortcutId]
  const hasPrimaryModifier = event.metaKey || event.ctrlKey

  return (
    event.key.toLowerCase() === shortcut.key &&
    (!shortcut.primaryModifier || hasPrimaryModifier) &&
    !event.altKey &&
    !event.shiftKey
  )
}
