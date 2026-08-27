import { create } from "zustand"
import { persist } from "zustand/middleware"

import { desktopPersistOptions } from "@/lib/desktop-persist-storage"

type AuthFlowPurpose = "email-verification" | "sign-in"

type AuthFlowState = {
  email: string | null
  purpose: AuthFlowPurpose | null
  returnTo: string | null
  setAuthFlow: (flow: {
    email: string
    purpose: AuthFlowPurpose
    returnTo?: string | null
  }) => void
  clearAuthFlow: () => void
}

export const useAuthFlowStore = create<AuthFlowState>()(
  persist(
    (set) => ({
      email: null,
      purpose: null,
      returnTo: null,
      setAuthFlow: (flow) => set(flow),
      clearAuthFlow: () => set({ email: null, purpose: null, returnTo: null }),
    }),
    {
      ...desktopPersistOptions("zilobase-auth-flow"),
      partialize: ({ email, purpose, returnTo }) => ({
        email,
        purpose,
        returnTo,
      }),
    },
  ),
)
