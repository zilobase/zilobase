import { create } from "zustand"
import { persist } from "zustand/middleware"

type AppState = {
  activeOrganizationId: string | null
  setActiveOrganizationId: (organizationId: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeOrganizationId: null,
      setActiveOrganizationId: (activeOrganizationId) => set({ activeOrganizationId }),
    }),
    {
      name: "notelab-app",
    },
  ),
)
