import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

import { useAppShortcut } from "./shortcut-provider"

type UndoAction = {
  label: string
  redo: () => boolean | void
  undo: () => boolean | void
}

type EditorUndoAction = UndoAction & {
  owner: object
}

export type ActiveEditorHistoryTransition =
  | (EditorUndoAction & {
      count: number
      type: "push"
    })
  | {
      count: number
      owner: object
      type: "redo" | "undo"
    }

type UndoHistoryEntry = UndoAction & {
  owner?: object
}

type ActiveUndoHistoryScope = {
  id: symbol
  recordEditorTransition: (transition: ActiveEditorHistoryTransition) => void
}

type UndoHistoryContextValue = {
  pushAction: (action: UndoAction) => void
  runWithoutRecording: <T>(callback: () => T) => T
  shouldRecord: () => boolean
}

const UNDO_HISTORY_LIMIT = 100
const UndoHistoryContext = createContext<UndoHistoryContextValue | null>(null)
const editorHistoryBoundaries = new Set<() => void>()
let activeUndoHistoryScope: ActiveUndoHistoryScope | null = null

export function recordActiveUndoHistoryEditorTransition(
  transition: ActiveEditorHistoryTransition,
) {
  activeUndoHistoryScope?.recordEditorTransition(transition)
}

export function registerEditorHistoryBoundary(boundary: () => void) {
  editorHistoryBoundaries.add(boundary)
  return () => {
    editorHistoryBoundaries.delete(boundary)
  }
}

function closeEditorHistoryBoundaries() {
  for (const boundary of editorHistoryBoundaries) {
    boundary()
  }
}

function moveOwnedHistoryEntries(
  source: UndoHistoryEntry[],
  target: UndoHistoryEntry[],
  owner: object,
  count: number,
) {
  for (let moved = 0; moved < count; moved += 1) {
    let index = source.length - 1

    while (index >= 0 && source[index]?.owner !== owner) {
      index -= 1
    }

    if (index < 0) {
      return
    }

    const [entry] = source.splice(index, 1)
    if (entry) target.push(entry)
  }
}

function shouldUseNativeEditableHistory(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.closest('[aria-label="Document editor"][contenteditable="true"]')) {
    return false
  }

  return (
    target.isContentEditable ||
    target.matches("input, textarea, select, [role='textbox']")
  )
}

export function UndoHistoryScope({
  children,
  resetKey,
}: {
  children: ReactNode
  resetKey: unknown
}) {
  const scopeIdRef = useRef(Symbol("undo-history-scope"))
  const redoActionsRef = useRef<UndoHistoryEntry[]>([])
  const undoActionsRef = useRef<UndoHistoryEntry[]>([])
  const recordingSuppressionDepthRef = useRef(0)
  const recordEditorTransitionRef = useRef<
    (transition: ActiveEditorHistoryTransition) => void
  >(() => {})
  const scopeRef = useRef<ActiveUndoHistoryScope | null>(null)

  if (!scopeRef.current) {
    scopeRef.current = {
      id: scopeIdRef.current,
      recordEditorTransition: (transition) =>
        recordEditorTransitionRef.current(transition),
    }
  }

  const activate = useCallback(() => {
    activeUndoHistoryScope = scopeRef.current
  }, [])
  const pushAction = useCallback(
    (action: UndoAction) => {
      if (recordingSuppressionDepthRef.current > 0) {
        return
      }

      closeEditorHistoryBoundaries()
      undoActionsRef.current.push(action)
      redoActionsRef.current = []
      activeUndoHistoryScope = scopeRef.current

      if (undoActionsRef.current.length > UNDO_HISTORY_LIMIT) {
        undoActionsRef.current.shift()
      }
    },
    []
  )
  const runWithoutRecording = useCallback(<T,>(callback: () => T) => {
    recordingSuppressionDepthRef.current += 1

    try {
      return callback()
    } finally {
      recordingSuppressionDepthRef.current -= 1
    }
  }, [])
  const shouldRecord = useCallback(
    () => recordingSuppressionDepthRef.current === 0,
    []
  )
  const recordEditorTransition = useCallback(
    (transition: ActiveEditorHistoryTransition) => {
      if (recordingSuppressionDepthRef.current > 0) {
        return
      }

      if (transition.type === "push") {
        const entry: EditorUndoAction = {
          label: transition.label,
          owner: transition.owner,
          redo: transition.redo,
          undo: transition.undo,
        }

        for (let index = 0; index < transition.count; index += 1) {
          undoActionsRef.current.push(entry)
        }

        redoActionsRef.current = []

        while (undoActionsRef.current.length > UNDO_HISTORY_LIMIT) {
          undoActionsRef.current.shift()
        }
        return
      }

      if (transition.type === "undo") {
        moveOwnedHistoryEntries(
          undoActionsRef.current,
          redoActionsRef.current,
          transition.owner,
          transition.count,
        )
        return
      }

      moveOwnedHistoryEntries(
        redoActionsRef.current,
        undoActionsRef.current,
        transition.owner,
        transition.count,
      )
    },
    [],
  )
  recordEditorTransitionRef.current = recordEditorTransition
  const contextValue = useMemo(
    () => ({ pushAction, runWithoutRecording, shouldRecord }),
    [pushAction, runWithoutRecording, shouldRecord]
  )

  useAppShortcut(
    "undo",
    (event) => {
      if (
        activeUndoHistoryScope?.id !== scopeIdRef.current ||
        shouldUseNativeEditableHistory(event.target)
      ) {
        return false
      }

      while (undoActionsRef.current.length > 0) {
        const action = undoActionsRef.current.pop()

        if (
          action &&
          runWithoutRecording(() => action.undo()) !== false
        ) {
          redoActionsRef.current.push(action)
          return true
        }
      }

      return false
    },
    { allowInEditable: true, priority: 100 }
  )

  useAppShortcut(
    "redo",
    (event) => {
      if (
        activeUndoHistoryScope?.id !== scopeIdRef.current ||
        shouldUseNativeEditableHistory(event.target)
      ) {
        return false
      }

      while (redoActionsRef.current.length > 0) {
        const action = redoActionsRef.current.pop()

        if (
          action &&
          runWithoutRecording(() => action.redo()) !== false
        ) {
          undoActionsRef.current.push(action)
          return true
        }
      }

      return false
    },
    { allowInEditable: true, priority: 100 }
  )

  useEffect(() => {
    redoActionsRef.current = []
    undoActionsRef.current = []
  }, [resetKey])

  useEffect(
    () => () => {
      if (activeUndoHistoryScope?.id === scopeIdRef.current) {
        activeUndoHistoryScope = null
      }
    },
    []
  )

  return (
    <UndoHistoryContext.Provider value={contextValue}>
      <div className="contents" onPointerDownCapture={activate}>
        {children}
      </div>
    </UndoHistoryContext.Provider>
  )
}

export function useUndoHistory() {
  const context = useContext(UndoHistoryContext)

  if (!context) {
    throw new Error("useUndoHistory must be used inside UndoHistoryScope")
  }

  return context
}

export function useOptionalUndoHistory() {
  return useContext(UndoHistoryContext)
}
