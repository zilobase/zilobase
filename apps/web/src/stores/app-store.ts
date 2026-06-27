import { create } from "zustand"
import { persist } from "zustand/middleware"

type AppState = {
  activeWorkspaceId: string | null
  setActiveWorkspaceId: (workspaceId: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
    }),
    {
      name: "notelab-app",
    },
  ),
)
