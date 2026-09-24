export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  image?: string | null;
};

export type Session = {
  id: string;
  userId: string;
  activeWorkspaceId?: string | null;
  activeTeamId?: string | null;
  expiresAt: string;
};

export type SessionResponse = {
  demoMode?: boolean;
  user: SessionUser | null;
  session: Session | null;
  workspacePinned?: boolean;
};

export type SignInWithOtpInput = {
  email: string;
  otp: string;
};

export type SignInWithPasswordInput = {
  email: string;
  password: string;
};

export type SignUpInput = {
  callbackURL?: string;
  name: string;
  email: string;
  password: string;
  invitationId?: string;
};

export type VerifyEmailOtpInput = {
  email: string;
  otp: string;
};
