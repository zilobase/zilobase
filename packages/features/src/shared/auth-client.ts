import type {
  SessionResponse,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "../auth/contracts"

export type ZilobaseAuthClient = {
  getSession: (signal?: AbortSignal) => Promise<SessionResponse>
  requestSignInOtp: (email: string) => Promise<{ success: boolean }>
  signInWithOtp: (input: SignInWithOtpInput) => Promise<{ token: string; user: unknown }>
  signInWithPassword: (
    input: SignInWithPasswordInput,
  ) => Promise<{ token: string; user: unknown }>
  signUp: (input: SignUpInput) => Promise<{ user: unknown }>
  requestEmailVerificationOtp: (email: string) => Promise<{ success: boolean }>
  verifyEmailOtp: (input: VerifyEmailOtpInput) => Promise<{ user: unknown }>
  signOut: () => Promise<unknown>
  createWorkspace: <TWorkspace>(input: {
    name: string
    slug: string
  }) => Promise<TWorkspace>
  setActiveWorkspace: (workspaceId: string) => Promise<unknown>
  inviteWorkspaceMember: (input: {
    email: string
    workspaceId: string
    role: string
  }) => Promise<unknown>
  acceptWorkspaceInvitation: <TResponse>(input: {
    invitationId: string
  }) => Promise<TResponse>
  listWorkspaces: <TWorkspace>(signal?: AbortSignal) => Promise<TWorkspace[]>
  listWorkspaceInvitations: <TInvitation>(
    workspaceId: string,
    signal?: AbortSignal,
  ) => Promise<TInvitation[]>
}
