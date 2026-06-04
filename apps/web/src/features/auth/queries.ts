import { queryOptions } from "@tanstack/react-query"

import { ApiError, apiFetch } from "@/lib/api"

export type SessionUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

export type Session = {
  id: string
  userId: string
  activeOrganizationId?: string | null
  activeTeamId?: string | null
  expiresAt: string
}

export type SessionResponse = {
  user: SessionUser | null
  session: Session | null
}

export const sessionQueryKey = ["session"] as const

export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: async () => {
    try {
      return await apiFetch<SessionResponse>("/session")
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return { user: null, session: null }
      }

      throw error
    }
  },
})
