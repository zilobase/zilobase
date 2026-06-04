import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import {
  sessionQueryKey,
  sessionQueryOptions,
  type SignInWithOtpInput,
  type SignUpInput,
  type VerifyEmailOtpInput,
} from "./queries"

export function useSession() {
  const { auth } = useNotelabFeatures()

  return useQuery(sessionQueryOptions(auth))
}

async function refreshSessionQuery(
  auth: ReturnType<typeof useNotelabFeatures>["auth"],
  queryClient: ReturnType<typeof useNotelabFeatures>["queryClient"],
) {
  return queryClient.fetchQuery({
    ...sessionQueryOptions(auth),
    staleTime: 0,
  })
}

export function useRequestSignInOtp() {
  const { auth } = useNotelabFeatures()

  return useMutation({
    mutationFn: (email: string) => auth.requestSignInOtp(email),
  })
}

export function useSignInWithOtp() {
  const { auth, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: SignInWithOtpInput) => auth.signInWithOtp(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}

export function useSignUp() {
  const { auth } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: SignUpInput) => auth.signUp(input),
  })
}

export function useRequestEmailVerificationOtp() {
  const { auth } = useNotelabFeatures()

  return useMutation({
    mutationFn: (email: string) => auth.requestEmailVerificationOtp(email),
  })
}

export function useVerifyEmailOtp() {
  const { auth, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: (input: VerifyEmailOtpInput) => auth.verifyEmailOtp(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await refreshSessionQuery(auth, queryClient)
    },
  })
}

export function useSignOut() {
  const { auth, queryClient } = useNotelabFeatures()

  return useMutation({
    mutationFn: () => auth.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, { user: null, session: null })
    },
  })
}
