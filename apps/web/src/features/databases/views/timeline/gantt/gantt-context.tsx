import { atom, useAtom, useSetAtom } from "jotai"
import { createContext, useContext } from "react"

import type { GanttContextProps } from "./gantt-types"

const draggingAtom = atom(false)
const scrollXAtom = atom(0)

export const GanttContext = createContext<GanttContextProps>({
  columnWidth: 50,
  headerHeight: 60,
  hideHeaderTitle: false,
  placeholderLength: 2,
  range: "monthly",
  ref: null,
  rowHeight: 36,
  sidebarWidth: 300,
  timelineData: [],
  timelineWidth: 0,
  zoom: 100,
})

export function useGanttContext(): GanttContextProps {
  return useContext(GanttContext)
}

export function useGanttDragging() {
  return useAtom(draggingAtom)
}

export function useGanttScrollX() {
  return useAtom(scrollXAtom)
}

export function useSetGanttDragging() {
  return useSetAtom(draggingAtom)
}

export function useSetGanttScrollX() {
  return useSetAtom(scrollXAtom)
}
