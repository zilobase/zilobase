import {
  NotelabFeaturesProvider,
  type NotelabAuthClient,
} from "@notelab/features"
import type {
  AcceptOrganizationInvitationResponse,
  Organization,
  OrganizationInvitation,
  OrganizationRole,
} from "@notelab/features/organizations"
import type {
  SessionResponse,
  SignInWithOtpInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "@notelab/features/auth"

import { apiFetch, authFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { useAppStore } from "@/stores/app-store"

export const webAuthClient: NotelabAuthClient = {
  getSession: () => apiFetch<SessionResponse>("/session"),
  requestSignInOtp: (email) =>
    authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    }),
  signInWithOtp: (input: SignInWithOtpInput) =>
    authFetch<{ token: string; user: unknown }>("/sign-in/email-otp", input),
  signUp: (input: SignUpInput) =>
    authFetch<{ user: unknown }>("/sign-up/email", {
      ...input,
      callbackURL: "/onboarding",
    }),
  requestEmailVerificationOtp: (email) =>
    authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
      email,
      type: "email-verification",
    }),
  verifyEmailOtp: (input: VerifyEmailOtpInput) =>
    authFetch<{ user: unknown }>("/email-otp/verify-email", input),
  signOut: () => authFetch("/sign-out"),
  createOrganization: <TOrganization,>(input: { name: string; slug: string }) =>
    authFetch<Organization>("/organization/create", input) as Promise<TOrganization>,
  setActiveOrganization: (organizationId: string) =>
    authFetch("/organization/set-active", { organizationId }),
  inviteOrganizationMember: (input: {
    email: string
    organizationId: string
    role: string
  }) =>
    authFetch("/organization/invite-member", {
      ...input,
      role: input.role as OrganizationRole,
    }),
  acceptOrganizationInvitation: <TResponse,>(input: { invitationId: string }) =>
    authFetch<AcceptOrganizationInvitationResponse>(
      "/organization/accept-invitation",
      input,
    ) as Promise<TResponse>,
  listOrganizations: <TOrganization,>() =>
    apiFetch<Organization[]>("/api/auth/organization/list", {
      method: "GET",
    }) as Promise<TOrganization[]>,
  listOrganizationInvitations: <TInvitation,>(organizationId: string) =>
    apiFetch<OrganizationInvitation[]>(
      `/api/auth/organization/list-invitations?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "GET",
      },
    ) as Promise<TInvitation[]>,
}

export function WebFeaturesProvider({
  children,
}: React.PropsWithChildren) {
  const preferredActiveOrganizationId = useAppStore(
    (state) => state.activeOrganizationId,
  )
  const setPreferredActiveOrganizationId = useAppStore(
    (state) => state.setActiveOrganizationId,
  )

  return (
    <NotelabFeaturesProvider
      value={{
        apiFetch,
        auth: webAuthClient,
        preferredActiveOrganizationId,
        queryClient,
        setPreferredActiveOrganizationId,
      }}
    >
      {children}
    </NotelabFeaturesProvider>
  )
}
