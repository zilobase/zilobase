export const appShortcutDefinitions = {
  openSearch: {
    key: "k",
    primaryModifier: true,
    shiftKey: false,
  },
  redo: {
    key: "z",
    primaryModifier: true,
    shiftKey: true,
  },
  undo: {
    key: "z",
    primaryModifier: true,
    shiftKey: false,
  },
} as const

export type AppShortcutId = keyof typeof appShortcutDefinitions

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>

type ShortcutPointerEvent = Pick<
  MouseEvent,
  "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
>

export function isOpenInNewTabShortcut(event: ShortcutPointerEvent) {
  return (
    event.button === 0 &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  )
}

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
    event.shiftKey === shortcut.shiftKey
  )
}
