import { useMutation, useQuery } from "@tanstack/react-query"

import { authFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { sessionQueryKey, sessionQueryOptions } from "@/features/auth/queries"

export function useSession() {
  return useQuery(sessionQueryOptions)
}

export function refreshSession() {
  return queryClient.fetchQuery({
    ...sessionQueryOptions,
    staleTime: 0,
  })
}

export function useRequestSignInOtp() {
  return useMutation({
    mutationFn: (email: string) =>
      authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
        email,
        type: "sign-in",
      }),
  })
}

export function useSignInWithOtp() {
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      authFetch<{ token: string; user: unknown }>("/sign-in/email-otp", {
        email,
        otp,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSession()
    },
  })
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      authFetch<{ user: unknown }>("/sign-up/email", {
        ...input,
        callbackURL: "/onboarding",
      }),
  })
}

export function useRequestEmailVerificationOtp() {
  return useMutation({
    mutationFn: (email: string) =>
      authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
        email,
        type: "email-verification",
      }),
  })
}

export function useVerifyEmailOtp() {
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      authFetch<{ user: unknown }>("/email-otp/verify-email", {
        email,
        otp,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSession()
    },
  })
}

export function useSignOut() {
  return useMutation({
    mutationFn: () => authFetch("/sign-out"),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, { user: null, session: null })
    },
  })
}
