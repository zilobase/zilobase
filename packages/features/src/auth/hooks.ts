import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import {
  sessionQueryKey,
  sessionQueryOptions,
  type SessionResponse,
  type SessionUser,
  type SignInWithOtpInput,
  type SignInWithPasswordInput,
  type SignUpInput,
  type VerifyEmailOtpInput,
} from "./queries"

export function useSession() {
  const { auth } = useZilobaseFeatures()

  return useQuery(sessionQueryOptions(auth))
}

async function refreshSessionQuery(
  auth: ReturnType<typeof useZilobaseFeatures>["auth"],
  queryClient: ReturnType<typeof useZilobaseFeatures>["queryClient"],
) {
  return queryClient.fetchQuery({
    ...sessionQueryOptions(auth),
    staleTime: 0,
  })
}

export function useRequestSignInOtp() {
  const { auth } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (email: string) => auth.requestSignInOtp(email),
  })
}

export function useSignInWithOtp() {
  const { auth, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: SignInWithOtpInput) => auth.signInWithOtp(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}

export function useSignInWithPassword() {
  const { auth, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: SignInWithPasswordInput) =>
      auth.signInWithPassword(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}

export function useSignUp() {
  const { auth } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: SignUpInput) => auth.signUp(input),
  })
}

export function useRequestEmailVerificationOtp() {
  const { auth } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (email: string) => auth.requestEmailVerificationOtp(email),
  })
}

export function useVerifyEmailOtp() {
  const { auth, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: VerifyEmailOtpInput) => auth.verifyEmailOtp(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}

export function useSignOut() {
  const { auth, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: () => auth.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, { user: null, session: null })
    },
  })
}

export function useUpdateUserProfile() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: { email: string; name: string }) =>
      apiFetch<{ user: SessionUser }>("/user-settings/profile", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(
        sessionQueryKey,
        (current: SessionResponse | undefined) => ({
          session: current?.session ?? null,
          user,
        }),
      )
    },
  })
}

export function useChangePassword() {
  const { apiFetch, auth, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: {
      currentPassword: string
      newPassword: string
      revokeOtherSessions?: boolean
    }) =>
      apiFetch<{
        token: string | null
        user: SessionUser
      }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}

export function useSetPassword() {
  const { apiFetch, auth, queryClient } = useZilobaseFeatures()

  return useMutation({
    mutationFn: (input: { newPassword: string }) =>
      apiFetch<{ status: boolean }>("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}
