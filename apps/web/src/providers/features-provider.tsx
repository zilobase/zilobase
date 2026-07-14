import {
  NotelabFeaturesProvider,
  type NotelabAuthClient,
} from "@notelab/features"
import type {
  AcceptWorkspaceInvitationResponse,
  Workspace,
  WorkspaceInvitation,
  WorkspaceRole,
} from "@notelab/features/workspaces"
import type {
  SessionResponse,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "@notelab/features/auth"

import { apiFetch, authFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { useAppStore } from "@/stores/app-store"
import { isFeatureEnabled } from "@/config/feature-flags"

export const webAuthClient: NotelabAuthClient = {
  getSession: () => apiFetch<SessionResponse>("/session"),
  requestSignInOtp: (email) =>
    authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    }),
  signInWithOtp: (input: SignInWithOtpInput) =>
    authFetch<{ token: string; user: unknown }>("/sign-in/email-otp", input),
  signInWithPassword: (input: SignInWithPasswordInput) =>
    authFetch<{ token: string; user: unknown }>("/sign-in/email", input),
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
  createWorkspace: <TWorkspace,>(input: { name: string; slug: string }) =>
    authFetch<Workspace>("/workspace/create", input) as Promise<TWorkspace>,
  setActiveWorkspace: (workspaceId: string) =>
    authFetch("/workspace/set-active", { workspaceId }),
  inviteWorkspaceMember: (input: {
    email: string
    workspaceId: string
    role: string
  }) =>
    authFetch("/workspace/invite-member", {
      ...input,
      role: input.role as WorkspaceRole,
    }),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    authFetch<AcceptWorkspaceInvitationResponse>(
      "/workspace/accept-invitation",
      input,
    ) as Promise<TResponse>,
  listWorkspaces: <TWorkspace,>() =>
    apiFetch<Workspace[]>("/api/auth/workspace/list", {
      method: "GET",
    }) as Promise<TWorkspace[]>,
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string) =>
    apiFetch<WorkspaceInvitation[]>(
      `/api/auth/workspace/list-invitations?workspaceId=${encodeURIComponent(workspaceId)}`,
      {
        method: "GET",
      },
    ) as Promise<TInvitation[]>,
}

export function WebFeaturesProvider({
  children,
}: React.PropsWithChildren) {
  const preferredActiveWorkspaceId = useAppStore(
    (state) => state.activeWorkspaceId,
  )
  const setPreferredActiveWorkspaceId = useAppStore(
    (state) => state.setActiveWorkspaceId,
  )

  return (
    <NotelabFeaturesProvider
      value={{
        apiFetch,
        auth: webAuthClient,
        databaseRealtimeEnabled: isFeatureEnabled("databaseRealtime"),
        preferredActiveWorkspaceId,
        queryClient,
        setPreferredActiveWorkspaceId,
      }}
    >
      {children}
    </NotelabFeaturesProvider>
  )
}

