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

import { apiFetch, authFetch, clearApiAuthToken } from "@/features/desktop/network/api"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index"
import { queryClient } from "@/app/query-client"
import { useAppStore } from "@/features/desktop/state/app-store"
import { isFeatureEnabled } from "@/shared/config/feature-flags"
import {
  isHostedDemoRuntime,
  requestDemoGuard,
} from "@/features/demo"

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
  requestSignInOtp: (email) => isHostedDemoRuntime()
    ? rejectDemoAction()
    : authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
        email,
        type: "sign-in",
      }),
  signInWithOtp: (input: SignInWithOtpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ token: string; user: unknown }>("/sign-in/email-otp", input),
  signInWithPassword: (input: SignInWithPasswordInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ token: string; user: unknown }>("/sign-in/email", input),
  signUp: (input: SignUpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ user: unknown }>("/sign-up/email", {
          ...input,
          callbackURL:
            input.callbackURL ??
            (input.invitationId
              ? `/accept-invitation?id=${encodeURIComponent(input.invitationId)}`
              : "/onboarding"),
        }),
  requestEmailVerificationOtp: (email) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
          email,
          type: "email-verification",
        }),
  verifyEmailOtp: (input: VerifyEmailOtpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ user: unknown }>("/email-otp/verify-email", input),
  signOut: async () => {
    if (isHostedDemoRuntime()) throw requestDemoGuard()
    const result = await authFetch("/sign-out", {})
    await clearApiAuthToken()
    useAppStore.getState().resetAccountState()
    return result
  },
  createWorkspace: <TWorkspace,>(input: { name: string; slug: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TWorkspace>()
      : authFetch<Workspace>("/workspace/create", input) as Promise<TWorkspace>,
  setActiveWorkspace: (workspaceId: string) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch("/workspace/set-active", { workspaceId }),
  inviteWorkspaceMember: (input: {
    email: string
    workspaceId: string
    role: string
  }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch("/workspace/invite-member", {
          ...input,
          role: input.role as WorkspaceRole,
        }),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TResponse>()
      : authFetch<AcceptWorkspaceInvitationResponse>(
          "/workspace/accept-invitation",
          input,
        ) as Promise<TResponse>,
  listWorkspaces: <TWorkspace,>() =>
    isHostedDemoRuntime()
      ? apiFetch<{ workspace: Workspace }>("/demo/bootstrap", {
          method: "GET",
        }).then(({ workspace }) => [workspace] as TWorkspace[])
      : apiFetch<Workspace[]>("/api/auth/workspace/list", {
          method: "GET",
        }) as Promise<TWorkspace[]>,
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string) =>
    isHostedDemoRuntime()
      ? Promise.resolve([])
      : apiFetch<WorkspaceInvitation[]>(
          `/api/auth/workspace/list-invitations?workspaceId=${encodeURIComponent(workspaceId)}`,
          {
            method: "GET",
          },
        ) as Promise<TInvitation[]>,
}

function rejectDemoAction<T = unknown>(): Promise<T> {
  return Promise.reject(requestDemoGuard())
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
        databaseRealtimeEnabled:
          !isHostedDemoRuntime() && isFeatureEnabled("databaseRealtime"),
        navigationRealtimeEnabled:
          !isHostedDemoRuntime() && isFeatureEnabled("navigationRealtime"),
        preferredActiveWorkspaceId,
        queryClient,
        setPreferredActiveWorkspaceId,
      }}
    >
      {children}
    </ZilobaseFeaturesProvider>
  )
}
