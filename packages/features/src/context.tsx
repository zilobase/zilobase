import type { QueryClient } from "@tanstack/react-query"
import { createContext, useContext } from "react"

import type {
  SessionResponse,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "./auth/queries"

export type ApiFetcher = <T>(path: string, init?: RequestInit) => Promise<T>

export type NotelabAuthClient = {
  getSession: () => Promise<SessionResponse>
  requestSignInOtp: (email: string) => Promise<{ success: boolean }>
  signInWithOtp: (input: SignInWithOtpInput) => Promise<{ token: string; user: unknown }>
  signInWithPassword: (
    input: SignInWithPasswordInput,
  ) => Promise<{ token: string; user: unknown }>
  signUp: (input: SignUpInput) => Promise<{ user: unknown }>
  requestEmailVerificationOtp: (email: string) => Promise<{ success: boolean }>
  verifyEmailOtp: (input: VerifyEmailOtpInput) => Promise<{ user: unknown }>
  signOut: () => Promise<unknown>
  createWorkspace: <TWorkspace>(input: {
    name: string
    slug: string
  }) => Promise<TWorkspace>
  setActiveWorkspace: (workspaceId: string) => Promise<unknown>
  inviteWorkspaceMember: (input: {
    email: string
    workspaceId: string
    role: string
  }) => Promise<unknown>
  acceptWorkspaceInvitation: <TResponse>(input: {
    invitationId: string
  }) => Promise<TResponse>
  listWorkspaces: <TWorkspace>() => Promise<TWorkspace[]>
  listWorkspaceInvitations: <TInvitation>(
    workspaceId: string,
  ) => Promise<TInvitation[]>
}

export type NotelabFeaturesConfig = {
  apiFetch: ApiFetcher
  auth: NotelabAuthClient
  preferredActiveWorkspaceId?: string | null
  queryClient: QueryClient
  databaseRealtimeEnabled?: boolean
  setPreferredActiveWorkspaceId?: (workspaceId: string | null) => void
}

const NotelabFeaturesContext = createContext<NotelabFeaturesConfig | null>(null)

export function NotelabFeaturesProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: NotelabFeaturesConfig }>) {
  return (
    <NotelabFeaturesContext.Provider value={value}>
      {children}
    </NotelabFeaturesContext.Provider>
  )
}

export function useNotelabFeatures() {
  const value = useContext(NotelabFeaturesContext)

  if (!value) {
    throw new Error(
      "NotelabFeaturesProvider is missing. Wrap your app before using @notelab/features hooks.",
    )
  }

  return value
}
