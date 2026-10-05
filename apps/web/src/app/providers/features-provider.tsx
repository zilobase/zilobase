import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import type {
  AcceptWorkspaceInvitationResponse,
  Workspace,
  WorkspaceInvitation,
  WorkspaceRole,
} from "@zilobase/features/workspaces";
import type {
  SessionResponse,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "@zilobase/features/auth";

import { installSharedClient } from "@zilobase/features/data";
import { sessionQueryKey } from "@zilobase/features/auth";
import { apiFetch, authFetch, clearApiAuthToken, resolveApiBaseUrl } from "@/platform/network/api";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import { queryClient } from "@/app/query-client";
import { useAppStore } from "@/features/desktop/state/app-store";
import { isHostedDemoRuntime, requestDemoGuard } from "@/features/demo";
import posthog from "@/shared/lib/posthog";
import { readOAuthQuery } from "@/features/oauth/lib/oauth-query";
import {
  clearCachedSession,
  clearPageCacheForUser,
  readCachedSession,
  rememberCachedSession,
} from "@/features/editor/collaboration/page-document-cache";
import { getConnectivityState } from "@/platform/network/connectivity";

installSharedClient(queryClient, () => {
  const session = queryClient.getQueryData<SessionResponse>(sessionQueryKey);
  return {
    deployment: resolveApiBaseUrl() || window.location.origin,
    viewer:
      session?.user && session.session
        ? {
            kind: "account",
            accountId: session.user.id,
            actorId: session.user.id,
            sessionId: session.session.id,
          }
        : { kind: "public", capabilityId: "unauthenticated" },
  };
});

function withOAuthQuery<T extends Record<string, unknown>>(input: T) {
  if (typeof window === "undefined") {
    return input;
  }

  const oauthQuery = readOAuthQuery();
  return oauthQuery ? { ...input, oauth_query: oauthQuery } : input;
}

export const webAuthClient: ZilobaseAuthClient = {
  getSession: async (signal) => {
    const startedAt = performance.now();
    recordDesktopDiagnostic("session.request", { status: "started" });
    try {
      const session = await apiFetch<SessionResponse>("/session", {
        signal,
        timeoutMs: 15_000,
      });
      if (session.user) {
        await rememberCachedSession(session).catch(() => undefined);
      } else {
        await clearCachedSession().catch(() => undefined);
      }
      recordDesktopDiagnostic("session.request", {
        duration_ms: performance.now() - startedAt,
        session_present: Boolean(session.session),
        status: "success",
        user_present: Boolean(session.user),
      });
      return session;
    } catch (error) {
      if (getConnectivityState() === "offline") {
        const cached = await readCachedSession().catch(() => null);
        if (cached) return cached;
      }
      recordDesktopDiagnostic(
        "session.request",
        {
          ...describeDesktopError(error),
          duration_ms: performance.now() - startedAt,
        },
        "error",
      );
      throw error;
    }
  },
  requestSignInOtp: (email) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        }),
  signInWithOtp: (input: SignInWithOtpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ token: string; user: unknown }>(
          "/sign-in/email-otp",
          withOAuthQuery({ ...input }),
        ),
  signInWithPassword: (input: SignInWithPasswordInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ token: string; user: unknown }>("/sign-in/email", withOAuthQuery({ ...input })),
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
    if (isHostedDemoRuntime()) throw requestDemoGuard();
    const previousSession = await readCachedSession();
    const result = await authFetch("/sign-out", {});
    await clearCachedSession();
    if (previousSession?.user) await clearPageCacheForUser(previousSession.user.id);
    posthog?.reset();
    await clearApiAuthToken();
    useAppStore.getState().resetAccountState();
    return result;
  },
  createWorkspace: <TWorkspace,>(input: { name: string; slug: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TWorkspace>()
      : (authFetch<Workspace>("/workspace/create", input) as Promise<TWorkspace>),
  setActiveWorkspace: (workspaceId: string) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch("/workspace/set-active", { workspaceId }),
  inviteWorkspaceMember: (input: { email: string; workspaceId: string; role: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch("/workspace/invite-member", {
          ...input,
          role: input.role as WorkspaceRole,
        }),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TResponse>()
      : (authFetch<AcceptWorkspaceInvitationResponse>(
          "/workspace/accept-invitation",
          input,
        ) as Promise<TResponse>),
  listWorkspaces: <TWorkspace,>(signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? apiFetch<{ workspace: Workspace }>("/demo/bootstrap", {
          method: "GET",
          signal,
        }).then(({ workspace }) => [workspace] as TWorkspace[])
      : (apiFetch<Workspace[]>("/api/auth/workspace/list", {
          method: "GET",
          signal,
        }) as Promise<TWorkspace[]>),
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string, signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? Promise.resolve([])
      : (apiFetch<WorkspaceInvitation[]>(
          `/api/auth/workspace/list-invitations?workspaceId=${encodeURIComponent(workspaceId)}`,
          {
            method: "GET",
            signal,
          },
        ) as Promise<TInvitation[]>),
};

function rejectDemoAction<T = unknown>(): Promise<T> {
  return Promise.reject(requestDemoGuard());
}

export function WebFeaturesProvider({ children }: React.PropsWithChildren) {
  const preferredActiveWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setPreferredActiveWorkspaceId = useAppStore((state) => state.setActiveWorkspaceId);

  return (
    <ZilobaseFeaturesProvider
      value={{
        apiFetch,
        auth: webAuthClient,
        databaseRealtimeEnabled: !isHostedDemoRuntime(),
        preferredActiveWorkspaceId,
        queryClient,
        setPreferredActiveWorkspaceId,
      }}
    >
      {children}
    </ZilobaseFeaturesProvider>
  );
}
