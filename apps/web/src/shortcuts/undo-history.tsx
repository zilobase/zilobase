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
  undo: () => boolean | void
}

type UndoHistoryContextValue = {
  pushAction: (action: UndoAction) => void
  runWithoutRecording: <T>(callback: () => T) => T
  shouldRecord: () => boolean
}

const UNDO_HISTORY_LIMIT = 100
const UndoHistoryContext = createContext<UndoHistoryContextValue | null>(null)
let activeUndoHistoryScope: symbol | null = null

export function UndoHistoryScope({
  children,
  resetKey,
}: {
  children: ReactNode
  resetKey: unknown
}) {
  const scopeIdRef = useRef(Symbol("undo-history-scope"))
  const actionsRef = useRef<UndoAction[]>([])
  const recordingSuppressionDepthRef = useRef(0)
  const activate = useCallback(() => {
    activeUndoHistoryScope = scopeIdRef.current
  }, [])
  const pushAction = useCallback(
    (action: UndoAction) => {
      if (recordingSuppressionDepthRef.current > 0) {
        return
      }

      actionsRef.current.push(action)
      activeUndoHistoryScope = scopeIdRef.current

      if (actionsRef.current.length > UNDO_HISTORY_LIMIT) {
        actionsRef.current.shift()
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
  const contextValue = useMemo(
    () => ({ pushAction, runWithoutRecording, shouldRecord }),
    [pushAction, runWithoutRecording, shouldRecord]
  )

  useAppShortcut(
    "undo",
    () => {
      if (activeUndoHistoryScope !== scopeIdRef.current) {
        return false
      }

      while (actionsRef.current.length > 0) {
        const action = actionsRef.current.pop()

        if (
          action &&
          runWithoutRecording(() => action.undo()) !== false
        ) {
          return true
        }
      }

      return false
    },
    { priority: 100 }
  )

  useEffect(() => {
    actionsRef.current = []
  }, [resetKey])

  useEffect(
    () => () => {
      if (activeUndoHistoryScope === scopeIdRef.current) {
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
