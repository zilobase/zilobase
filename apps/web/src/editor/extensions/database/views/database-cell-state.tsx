import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import type { DatabasePropertyValue } from "../core/utils"

type DatabaseCellState = {
  activeKey: string | null
  drafts: Record<string, DatabasePropertyValue>
  setActiveKey: (key: string | null) => void
  updateDraft: (
    key: string,
    updater: (current: DatabasePropertyValue | undefined) =>
      | DatabasePropertyValue
      | undefined
  ) => void
}

export function getUpdatedDatabaseCellDrafts(
  drafts: Record<string, DatabasePropertyValue>,
  key: string,
  updater: (current: DatabasePropertyValue | undefined) =>
    | DatabasePropertyValue
    | undefined
) {
  const nextValue = updater(drafts[key])
  const nextDrafts = { ...drafts }

  if (nextValue === undefined) {
    delete nextDrafts[key]
  } else {
    nextDrafts[key] = nextValue
  }

  return nextDrafts
}

const DatabaseCellStateContext = createContext<
  StoreApi<DatabaseCellState> | null
>(null)

export function DatabaseCellStateProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<StoreApi<DatabaseCellState> | null>(null)

  if (!storeRef.current) {
    storeRef.current = createStore<DatabaseCellState>((set) => ({
      activeKey: null,
      drafts: {},
      setActiveKey: (activeKey) => set({ activeKey }),
      updateDraft: (key, updater) =>
        set((state) => ({
          drafts: getUpdatedDatabaseCellDrafts(state.drafts, key, updater),
        })),
    }))
  }

  return (
    <DatabaseCellStateContext.Provider value={storeRef.current}>
      {children}
    </DatabaseCellStateContext.Provider>
  )
}

function useDatabaseCellStore<T>(selector: (state: DatabaseCellState) => T) {
  const store = useContext(DatabaseCellStateContext)

  if (!store) {
    throw new Error(
      "Database cell state must be used inside DatabaseCellStateProvider"
    )
  }

  return useStore(store, selector)
}

export function useDatabaseCellDraft(key: string) {
  return useDatabaseCellStore((state) => state.drafts[key])
}

export function useActiveDatabaseCellKey() {
  return useDatabaseCellStore((state) => state.activeKey)
}

export function useDatabaseCellIsActive(key: string) {
  return useDatabaseCellStore((state) => state.activeKey === key)
}

export function useSetActiveDatabaseCell() {
  return useDatabaseCellStore((state) => state.setActiveKey)
}

export function useUpdateDatabaseCellDraft() {
  return useDatabaseCellStore((state) => state.updateDraft)
}
