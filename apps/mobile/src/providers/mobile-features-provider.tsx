import { QueryClientProvider } from '@tanstack/react-query';
import {
  createNotelabQueryClient,
  NotelabFeaturesProvider,
  type NotelabAuthClient,
} from '@notelab/features';
import type {
  SessionResponse,
  SignInWithOtpInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from '@notelab/features/auth';
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceRole,
} from '@notelab/features/workspaces';
import * as React from 'react';

import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

const mobileAuthClient: NotelabAuthClient = {
  getSession: () => apiFetch<SessionResponse>('/session'),
  requestSignInOtp: (email) =>
    authClient.$fetch('/email-otp/send-verification-otp', {
      method: 'POST',
      body: {
        email,
        type: 'sign-in',
      },
    }) as Promise<{ success: boolean }>,
  signInWithOtp: (input: SignInWithOtpInput) =>
    authClient.$fetch('/sign-in/email-otp', {
      method: 'POST',
      body: input,
    }) as Promise<{ token: string; user: unknown }>,
  signUp: (input: SignUpInput) =>
    authClient.$fetch('/sign-up/email', {
      method: 'POST',
      body: {
        ...input,
        callbackURL: '/',
      },
    }) as Promise<{ user: unknown }>,
  requestEmailVerificationOtp: (email) =>
    authClient.$fetch('/email-otp/send-verification-otp', {
      method: 'POST',
      body: {
        email,
        type: 'email-verification',
      },
    }) as Promise<{ success: boolean }>,
  verifyEmailOtp: (input: VerifyEmailOtpInput) =>
    authClient.$fetch('/email-otp/verify-email', {
      method: 'POST',
      body: input,
    }) as Promise<{ user: unknown }>,
  signOut: () =>
    authClient.$fetch('/sign-out', {
      method: 'POST',
    }),
  createWorkspace: <TWorkspace,>(input: { name: string; slug: string }) =>
    authClient.$fetch('/workspace/create', {
      method: 'POST',
      body: input,
    }) as Promise<TWorkspace>,
  setActiveWorkspace: (workspaceId: string) =>
    authClient.$fetch('/workspace/set-active', {
      method: 'POST',
      body: { workspaceId },
    }),
  inviteWorkspaceMember: (input: {
    email: string;
    workspaceId: string;
    role: string;
  }) =>
    authClient.$fetch('/workspace/invite-member', {
      method: 'POST',
      body: {
        ...input,
        role: input.role as WorkspaceRole,
      },
    }),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    authClient.$fetch('/workspace/accept-invitation', {
      method: 'POST',
      body: input,
    }) as Promise<TResponse>,
  listWorkspaces: <TWorkspace,>() =>
    apiFetch<Workspace[]>('/api/auth/workspace/list', {
      method: 'GET',
    }) as Promise<TWorkspace[]>,
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string) =>
    apiFetch<WorkspaceInvitation[]>(
      `/api/auth/workspace/list-invitations?workspaceId=${encodeURIComponent(workspaceId)}`,
      {
        method: 'GET',
      }
    ) as Promise<TInvitation[]>,
};

type ProviderProps = React.PropsWithChildren;

export function MobileFeaturesProvider({ children }: ProviderProps) {
  const [queryClient] = React.useState(() => createNotelabQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <NotelabFeaturesProvider
        value={{
          apiFetch,
          auth: mobileAuthClient,
          queryClient,
        }}>
        {children}
      </NotelabFeaturesProvider>
    </QueryClientProvider>
  );
}
