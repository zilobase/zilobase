import {
  ZilobaseFeaturesProvider,
  type ZilobaseAuthClient,
} from "@zilobase/features"
import type {
  AcceptWorkspaceInvitationResponse,
  Workspace,
  WorkspaceInvitation,
  WorkspaceRole,
} from "@zilobase/features/workspaces"
import type {
  SessionResponse,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "@zilobase/features/auth"

import { apiFetch, authFetch, clearApiAuthToken } from "@/lib/api"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import { queryClient } from "@/lib/query-client"
import { useAppStore } from "@/stores/app-store"
import { isFeatureEnabled } from "@/config/feature-flags"

export const webAuthClient: ZilobaseAuthClient = {
  getSession: async () => {
    const startedAt = performance.now()
    recordDesktopDiagnostic("session.request", { status: "started" })
    try {
      const session = await apiFetch<SessionResponse>("/session", {
        timeoutMs: 15_000,
      })
      recordDesktopDiagnostic("session.request", {
        duration_ms: performance.now() - startedAt,
        session_present: Boolean(session.session),
        status: "success",
        user_present: Boolean(session.user),
      })
      return session
    } catch (error) {
      recordDesktopDiagnostic(
        "session.request",
        {
          ...describeDesktopError(error),
          duration_ms: performance.now() - startedAt,
        },
        "error",
      )
      throw error
    }
  },
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
      callbackURL: input.invitationId
        ? `/accept-invitation?id=${encodeURIComponent(input.invitationId)}`
        : "/onboarding",
    }),
  requestEmailVerificationOtp: (email) =>
    authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
      email,
      type: "email-verification",
    }),
  verifyEmailOtp: (input: VerifyEmailOtpInput) =>
    authFetch<{ user: unknown }>("/email-otp/verify-email", input),
  signOut: async () => {
    const result = await authFetch("/sign-out", {})
    await clearApiAuthToken()
    useAppStore.getState().resetAccountState()
    return result
  },
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
    <ZilobaseFeaturesProvider
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
    </ZilobaseFeaturesProvider>
  )
}
