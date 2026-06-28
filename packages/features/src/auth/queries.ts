import { queryOptions } from "@tanstack/react-query"

import type { NotelabAuthClient } from "../context"

export type SessionUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  hasPassword: boolean
  image?: string | null
}

export type Session = {
  id: string
  userId: string
  activeWorkspaceId?: string | null
  activeTeamId?: string | null
  expiresAt: string
}

export type SessionResponse = {
  user: SessionUser | null
  session: Session | null
}

export type SignInWithOtpInput = {
  email: string
  otp: string
}

export type SignInWithPasswordInput = {
  email: string
  password: string
}

export type SignUpInput = {
  name: string
  email: string
  password: string
}

export type VerifyEmailOtpInput = {
  email: string
  otp: string
}

export const sessionQueryKey = ["session"] as const

export const sessionQueryOptions = (auth: NotelabAuthClient) =>
  queryOptions({
    queryKey: sessionQueryKey,
    queryFn: async () => {
      try {
        return await auth.getSession()
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return { user: null, session: null }
        }

        throw error
      }
    },
  })
