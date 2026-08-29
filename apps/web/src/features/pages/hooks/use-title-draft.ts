import { useCallback, useEffect, useReducer, useRef } from "react"

export type TitleDraftState = {
  dirty: boolean
  sourceId: string | null
  value: string
}

export type TitleDraftAction =
  | { sourceId: string | null; title: string; type: "source" }
  | { type: "edit"; value: string }
  | { draft: string; sourceId: string; title: string; type: "saved" }

export function reduceTitleDraft(
  state: TitleDraftState,
  action: TitleDraftAction,
): TitleDraftState {
  if (action.type === "edit") {
    return { ...state, dirty: true, value: action.value }
  }

  if (action.type === "saved") {
    if (state.sourceId !== action.sourceId || state.value !== action.draft) {
      return state
    }

    return { ...state, dirty: false, value: action.title }
  }

  if (state.sourceId !== action.sourceId) {
    return {
      dirty: false,
      sourceId: action.sourceId,
      value: action.title,
    }
  }

  if (state.dirty || state.value === action.title) {
    return state
  }

  return { ...state, value: action.title }
}

export function useTitleDraft({
  enabled,
  onSave,
  saveDelay = 600,
  sourceId,
  sourceTitle,
}: {
  enabled: boolean
  onSave: (title: string) => Promise<unknown>
  saveDelay?: number
  sourceId: string | null
  sourceTitle: string
}) {
  const [state, dispatch] = useReducer(reduceTitleDraft, {
    dirty: false,
    sourceId,
    value: sourceTitle,
  })
  const onSaveRef = useRef(onSave)
  // Keep title writes ordered so an older request cannot finish last.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    dispatch({ sourceId, title: sourceTitle, type: "source" })
  }, [sourceId, sourceTitle])

  useEffect(() => {
    if (
      !enabled ||
      !sourceId ||
      !state.dirty ||
      state.sourceId !== sourceId
    ) {
      return
    }

    const draft = state.value
    const savedTitle = draft.trim()

    if (savedTitle === sourceTitle) {
      return
    }

    const timeout = window.setTimeout(() => {
      const save = onSaveRef.current
      const savePromise = saveChainRef.current.then(
        () => save(savedTitle),
        () => save(savedTitle),
      )

      saveChainRef.current = savePromise.then(
        () => undefined,
        () => undefined,
      )

      void savePromise.then(
        () => {
          dispatch({
            draft,
            sourceId,
            title: savedTitle,
            type: "saved",
          })
        },
        () => undefined,
      )
    }, saveDelay)

    return () => window.clearTimeout(timeout)
  }, [
    enabled,
    saveDelay,
    sourceId,
    sourceTitle,
    state.dirty,
    state.sourceId,
    state.value,
  ])

  const setTitle = useCallback((value: string) => {
    dispatch({ type: "edit", value })
  }, [])

  return {
    setTitle,
    title: state.sourceId === sourceId ? state.value : sourceTitle,
  }
}
