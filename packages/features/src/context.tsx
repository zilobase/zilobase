import type { QueryClient } from "@tanstack/react-query"
import { createContext, useContext } from "react"

import type {
  SessionResponse,
  SignInWithOtpInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "./auth/queries"

export type ApiFetcher = <T>(path: string, init?: RequestInit) => Promise<T>

export type NotelabAuthClient = {
  getSession: () => Promise<SessionResponse>
  requestSignInOtp: (email: string) => Promise<{ success: boolean }>
  signInWithOtp: (input: SignInWithOtpInput) => Promise<{ token: string; user: unknown }>
  signUp: (input: SignUpInput) => Promise<{ user: unknown }>
  requestEmailVerificationOtp: (email: string) => Promise<{ success: boolean }>
  verifyEmailOtp: (input: VerifyEmailOtpInput) => Promise<{ user: unknown }>
  signOut: () => Promise<unknown>
  createOrganization: <TOrganization>(input: {
    name: string
    slug: string
  }) => Promise<TOrganization>
  setActiveOrganization: (organizationId: string) => Promise<unknown>
  inviteOrganizationMember: (input: {
    email: string
    organizationId: string
    role: string
  }) => Promise<unknown>
  acceptOrganizationInvitation: <TResponse>(input: {
    invitationId: string
  }) => Promise<TResponse>
  listOrganizations: <TOrganization>() => Promise<TOrganization[]>
  listOrganizationInvitations: <TInvitation>(
    organizationId: string,
  ) => Promise<TInvitation[]>
}

export type NotelabFeaturesConfig = {
  apiFetch: ApiFetcher
  auth: NotelabAuthClient
  preferredActiveOrganizationId?: string | null
  queryClient: QueryClient
  setPreferredActiveOrganizationId?: (organizationId: string | null) => void
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
