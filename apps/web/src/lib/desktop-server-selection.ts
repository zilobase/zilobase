export type DesktopServerSelectionState =
  | { phase: "selected" }
  | { phase: "editing" }
  | { phase: "verifying" }
  | { phase: "error"; message: string }

export type DesktopServerSelectionAction =
  | { type: "edit" }
  | { type: "cancel" }
  | { type: "verify" }
  | { type: "verified" }
  | { type: "failed"; message: string }

export const initialDesktopServerSelectionState: DesktopServerSelectionState = {
  phase: "selected",
}

export function reduceDesktopServerSelection(
  _state: DesktopServerSelectionState,
  action: DesktopServerSelectionAction,
): DesktopServerSelectionState {
  switch (action.type) {
    case "edit":
      return { phase: "editing" }
    case "cancel":
    case "verified":
      return { phase: "selected" }
    case "verify":
      return { phase: "verifying" }
    case "failed":
      return { phase: "error", message: action.message }
  }
}
